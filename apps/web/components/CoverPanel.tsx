"use client";

import { useEffect, useState } from "react";
import { type Track, searchTracks, trackArtwork } from "../lib/api";
import type { CoverState, CoverStyle } from "../lib/story/cover";
import type { Photo } from "../lib/story/draw";
import { checkFile } from "../lib/upload";
import s from "./maker.module.css";

// Decoded artwork per track id, shared by the suggestion previews and the editor.
const artCache = new Map<number, Promise<Photo | null>>();

function artworkFor(trackId: number): Promise<Photo | null> {
  let p = artCache.get(trackId);
  if (!p) {
    p = trackArtwork(trackId)
      .then((b) => createImageBitmap(b))
      .catch(() => {
        artCache.delete(trackId); // allow a retry later
        return null;
      });
    artCache.set(trackId, p);
  }
  return p;
}

/** Cover image for a Story: the uploaded one when given, else Apple Music artwork by track id. */
export function useCoverImage(trackId: number | undefined, uploaded: Photo | null = null): Photo | null {
  const [art, setArt] = useState<{ id: number; img: Photo | null } | null>(null);
  useEffect(() => {
    if (!trackId) return;
    let live = true;
    void artworkFor(trackId).then((img) => live && setArt({ id: trackId, img }));
    return () => {
      live = false;
    };
  }, [trackId]);
  if (uploaded && !trackId) return uploaded;
  return art && art.id === trackId ? art.img : null;
}

const STYLES: { id: CoverStyle; label: string }[] = [
  { id: "ig", label: "Album art" },
  { id: "igpill", label: "Pill" },
  { id: "igart", label: "Art only" },
];

interface Props {
  cover: CoverState;
  onChange: (patch: Partial<CoverState>) => void;
  onUpload: (img: Photo) => void;
  /** Subject position of photo 1 (0..1), for "Place over face". */
  focus: { x: number; y: number };
  hasImage: boolean;
}

export function CoverPanel({ cover, onChange, onUpload, focus, hasImage }: Props) {
  const [q, setQ] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "busy" } | { kind: "results"; tracks: Track[] } | { kind: "error"; msg: string }>({ kind: "idle" });

  const search = async () => {
    if (q.trim().length < 2) return;
    setState({ kind: "busy" });
    try {
      const tracks = await searchTracks(q.trim());
      setState(tracks.length ? { kind: "results", tracks } : { kind: "error", msg: "No songs with cover art found." });
    } catch (e) {
      setState({ kind: "error", msg: e instanceof Error ? e.message : "Search failed." });
    }
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    const check = await checkFile(file);
    if (!check.ok) return setState({ kind: "error", msg: check.error });
    try {
      onUpload(await createImageBitmap(file));
      onChange({ show: true, trackId: undefined });
    } catch {
      setState({ kind: "error", msg: "Couldn't read that image." });
    }
  };

  return (
    <fieldset className={s.group}>
      <legend>Song cover</legend>
      <label className={s.row}>
        <input type="checkbox" checked={cover.show} onChange={(e) => onChange({ show: e.target.checked })} /> Show a square song cover
      </label>
      <div className={s.searchRow}>
        <input
          className={s.input}
          value={q}
          maxLength={80}
          placeholder="Search a song or artist"
          aria-label="Search a song for its cover"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void search()}
        />
        <button className={s.secondary} disabled={state.kind === "busy"} onClick={() => void search()}>
          {state.kind === "busy" ? "Searching…" : "Search"}
        </button>
      </div>
      {state.kind === "results" && (
        <ul className={s.small} aria-label="Songs">
          {state.tracks.map((t) => (
            <li key={t.track_id}>
              <button
                className={s.linkBtn}
                aria-pressed={cover.trackId === t.track_id}
                onClick={() => onChange({ show: true, trackId: t.track_id, title: t.title, artist: t.artist })}
              >
                {t.title} — {t.artist}
              </button>
            </li>
          ))}
        </ul>
      )}
      {state.kind === "error" && <p role="alert" className={s.error}>{state.msg}</p>}
      <label className={s.field}>
        <span>…or use your own square image</span>
        <input type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={(e) => void upload(e.target.files?.[0])} />
      </label>
      {cover.show && (
        <>
          <div className={s.grid2}>
            <label className={s.field}>
              <span>Song title</span>
              <input className={s.input} maxLength={120} value={cover.title} onChange={(e) => onChange({ title: e.target.value })} />
            </label>
            <label className={s.field}>
              <span>Artist</span>
              <input className={s.input} maxLength={120} value={cover.artist} onChange={(e) => onChange({ artist: e.target.value })} />
            </label>
          </div>
          <div className={s.segment} role="group" aria-label="Cover style">
            {STYLES.map((st) => (
              <button key={st.id} aria-pressed={cover.style === st.id} className={cover.style === st.id ? s.segOn : ""} onClick={() => onChange({ style: st.id })}>
                {st.label}
              </button>
            ))}
          </div>
          {cover.style === "ig" && (
            <div className={s.segment} role="group" aria-label="Title colour">
              {[["#ffffff", "White text"], ["#111111", "Black text"]].map(([c, l]) => (
                <button key={c} aria-pressed={(cover.textColor ?? "#ffffff") === c} className={(cover.textColor ?? "#ffffff") === c ? s.segOn : ""} onClick={() => onChange({ textColor: c })}>
                  {l}
                </button>
              ))}
            </div>
          )}
          <div className={s.grid2}>
            <label className={s.field}>
              <span>Size</span>
              <input type="range" min={0.4} max={3} step={0.01} value={cover.scale} onChange={(e) => onChange({ scale: Number(e.target.value) })} />
            </label>
            <label className={s.field}>
              <span>Tilt · {Math.round(cover.rotate)}°</span>
              <input type="range" min={-30} max={30} step={1} value={cover.rotate} onChange={(e) => onChange({ rotate: Number(e.target.value) })} />
            </label>
          </div>
          <p className={s.small}>
            Drag the cover on the Story to move it ·{" "}
            <button className={s.linkBtn} onClick={() => onChange({ style: "ig", x: focus.x, y: Math.max(0.1, focus.y - 0.04), rotate: 0, scale: 1.3 })}>
              Place over face
            </button>
          </p>
          <p className={s.small}>
            {cover.trackId ? "Artwork via Apple Music." : hasImage ? "Your own cover image (not saved with the Story)." : "No cover image yet — your photo stands in."}
          </p>
        </>
      )}
    </fieldset>
  );
}

/** Album art for several tracks (playlist panel), keyed by track id. */
export function useTrackArt(trackIds: number[]): Map<number, Photo> {
  const [art, setArt] = useState<Map<number, Photo>>(() => new Map());
  const key = trackIds.join(",");
  useEffect(() => {
    if (!key) return;
    let live = true;
    const ids = key.split(",").map(Number);
    void Promise.all(ids.map((id) => artworkFor(id).then((img) => [id, img] as const))).then((pairs) => {
      if (!live) return;
      const m = new Map<number, Photo>();
      for (const [id, img] of pairs) if (img) m.set(id, img);
      setArt(m);
    });
    return () => {
      live = false;
    };
  }, [key]);
  return art;
}
