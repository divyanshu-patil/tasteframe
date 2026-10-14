"use client";

import { useEffect, useRef, useState } from "react";
import { type Music, type Song, songsOf } from "../lib/api";
import type { Photo } from "../lib/story/draw";
import { setSongShift, useSongShift } from "../lib/songShift";
import { useCoverImage } from "./CoverPanel";
import { PreviewCredit, playPreview, stopPreview, usePreview } from "./SongPreview";
import s from "./maker.module.css";

const TREND = { chart: "🔥 Top on Apple Music now", reels: "🔥 Trending on Reels" } as const;
const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

function Art({ trackId, label }: { trackId: number | null; label: string }) {
  const img = useCoverImage(trackId ?? undefined);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current?.getContext("2d");
    if (!c) return;
    c.fillStyle = "#1d1d1b";
    c.fillRect(0, 0, 192, 192);
    if (!img) return;
    const p = img as Photo;
    const side = Math.min(p.width, p.height);
    c.drawImage(p, (p.width - side) / 2, (p.height - side) / 2, side, side, 0, 0, 192, 192);
  }, [img]);
  return <canvas ref={ref} width={192} height={192} className={s.playerArt} role="img" aria-label={`Cover art: ${label}`} />;
}

/** The suggested songs as a player: 30 s previews, previous/next, shuffle and an up-next list.
 * Choosing a song makes it lead (it goes on the best layout; the rest follow in order). */
export function SongPlayer({ music, analysisId, moods = [] }: { music: Music; analysisId: string; moods?: string[] }) {
  const songs = songsOf(music);
  const shift = useSongShift(analysisId);
  const p = usePreview();
  const [shuffled, setShuffled] = useState(false);
  const shuffledRef = useRef(shuffled);
  shuffledRef.current = shuffled;
  if (!songs.length) return null;
  const n = songs.length;
  const idx = ((shift % n) + n) % n;
  const cur = songs[idx]!;
  const isCur = p.url !== null && p.url === cur.preview_url;
  const playing = isCur && p.playing;

  const event = (x: Song) => ({ artist: x.artist, title: x.title, song_source: x.source });
  const go = (k: number, autoplay = playing) => {
    const j = ((k % n) + n) % n;
    setSongShift(analysisId, j);
    const next = songs[j]!;
    if (autoplay && next.preview_url) play(next, j);
    else if (!autoplay) stopPreview();
  };
  const randomOther = () => {
    if (n < 2) return idx;
    let j = idx;
    while (j === idx) j = Math.floor(Math.random() * n);
    return j;
  };
  function play(x: Song, j: number) {
    // When a preview ends, the next one plays (a random one in shuffle).
    playPreview(x.preview_url!, event(x), () => go(shuffledRef.current ? randomOther() : j + 1, true));
  }
  return (
    <article className={s.player} aria-label="Song suggestions">
      <p className={s.kicker}>
        Now playing{music.vibe && <> · vibe: {music.vibe}</>} · {idx + 1}/{n}
      </p>
      <div className={s.playerHead}>
        <Art trackId={cur.track_id} label={`${cur.title} by ${cur.artist}`} />
        <div className={s.playerMeta}>
          <p className={s.playerTitle}>{cur.title}</p>
          <p className={s.playerArtist}>{cur.artist}</p>
          {cur.source === "qloo" ? (
            <span className={s.qlooChip}>Found by Qloo</span>
          ) : (
            <span className={s.vibeChip}>Picked for your photo&apos;s vibe</span>
          )}
          {cur.trending && <p className={s.small}><strong>{TREND[cur.trending]}</strong></p>}
        </div>
      </div>

      <div className={s.playerControls}>
        <button type="button" className={s.ctrlBtn} onClick={() => go(idx - 1)} aria-label="Previous song">⏮</button>
        <button
          type="button"
          className={s.playBtn}
          disabled={!cur.preview_url}
          onClick={() => (playing ? stopPreview() : play(cur, idx))}
          aria-label={playing ? `Pause ${cur.title}` : `Play a 30-second preview of ${cur.title}`}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <button type="button" className={s.ctrlBtn} onClick={() => go(idx + 1)} aria-label="Next song">⏭</button>
        <button
          type="button"
          className={`${s.ctrlBtn} ${shuffled ? s.ctrlOn : ""}`}
          aria-pressed={shuffled}
          onClick={() => {
            setShuffled(true);
            go(randomOther());
          }}
          aria-label="Shuffle: jump to a random suggested song and keep shuffling"
          title="Shuffle"
        >
          🔀
        </button>
        {shuffled && (
          <button type="button" className={s.linkBtn} onClick={() => setShuffled(false)}>
            shuffle off
          </button>
        )}
      </div>
      <div className={s.playerProgress} aria-hidden={!isCur}>
        <span className={s.playerTrack}>
          <span style={{ width: `${isCur ? Math.min(100, (p.time / (p.duration || 30)) * 100) : 0}%` }} />
        </span>
        <span className={s.mono}>{mmss(isCur ? p.time : 0)} / {mmss(isCur ? p.duration || 30 : 30)}</span>
      </div>
      {!cur.preview_url && <p className={s.small}>No preview for this song on Apple Music.</p>}
      {cur.why && <p className={s.small}>“{cur.why}”</p>}
      {moods.length > 0 && <p className={s.small}>Matched to the mood you asked for: <strong>{moods.join(" · ")}</strong></p>}
      {cur.url && (
        <a className={s.textLink} href={cur.url} target="_blank" rel="noopener noreferrer">
          Open in Apple Music ↗
        </a>
      )}

      {n > 1 && (
        <>
          <p className={s.small}>Up next — tap one to use it on your best layout:</p>
          <ol className={s.upNext}>
            {Array.from({ length: Math.min(4, n - 1) }, (_, k) => (idx + 1 + k) % n).map((j) => {
              const x = songs[j]!;
              return (
                <li key={`${x.artist}-${x.title}`}>
                  <button type="button" className={s.upNextBtn} onClick={() => go(j)}>
                    <strong>{x.title}</strong> <span className={s.muted}>{x.artist}</span>
                    {x.source === "qloo" && <span className={s.qlooChip}>Qloo</span>}
                  </button>
                </li>
              );
            })}
          </ol>
        </>
      )}
      {songs.some((x) => x.preview_url) && <PreviewCredit />}
      <p className={s.small}>{music.explanation}</p>
      <p className={s.small}>Add it with Instagram&apos;s Music sticker after you post.</p>
    </article>
  );
}
