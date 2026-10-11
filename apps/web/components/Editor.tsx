"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type Music, searchTracks } from "../lib/api";
import type { Photo } from "../lib/story/draw";
import { type EditorAction, editorReducer } from "../lib/story/editor";
import { exportFilename, exportPng } from "../lib/story/export";
import { FILTERS } from "../lib/story/filters";
import { FAMILY_RE, GOOGLE_FONTS, ROLE_FONTS, fontFailed } from "../lib/story/fonts";
import { LAYOUT_GROUPS, groupOf } from "../lib/story/groups";
import { pinsFor } from "../lib/story/pins";
import type { Selection } from "../lib/story/selection";
import { STICKER_KINDS, type Sticker, newSticker } from "../lib/story/stickers";
import { TEMPLATES, layoutBoxes, slotRectsFor } from "../lib/story/templates";
import type { Align, Crop, FontRole, StoryState, TemplateId, TemplateInput, TextKey, TextLayer } from "../lib/story/types";
import { CoverPanel, useCoverImage, useTrackArt } from "./CoverPanel";
import { CutoutRefiner } from "./CutoutRefiner";
import { ModelProgress } from "./ModelProgress";
import { ColorField, Section, Segmented, Slider, Toggle, deg, pct, px, times } from "./controls";
import { MusicCard } from "./Results";
import { LikeButton, NewBadge } from "./LikeButton";
import { PinSource } from "./PinSource";
import { StoryCanvas } from "./StoryCanvas";
import { FilterSwatch, PhotoThumb, StickerSwatch } from "./Swatches";
import { useMasks } from "./useMasks";
import { track } from "../lib/analytics";
import { PROPS } from "../lib/story/elements";
import s from "./maker.module.css";

interface Props {
  /** 1–4 photos; multi-photo layouts place them by state.order. */
  photos: Photo[];
  story: StoryState;
  setStory: React.Dispatch<React.SetStateAction<StoryState | null>>;
  input: (id: TemplateId) => TemplateInput;
  suggested: TemplateId[];
  music: Music | null;
  onBack?: () => void;
  onStartOver: () => void;
  /** Present only when saving is configured and the photo is uploaded. */
  onSave?: () => Promise<void>;
  signedIn?: boolean;
  /** Add photos later to fill a multi-photo layout's empty slots. */
  onAddPhotos?: (files: FileList | null) => Promise<void>;
}

const FONTS: { id: FontRole; label: string }[] = [
  { id: "display", label: "Didone" },
  { id: "serif", label: "Book serif" },
  { id: "italic", label: "Italic serif" },
  { id: "sans", label: "Grotesk" },
  { id: "hand", label: "Handwritten" },
  { id: "mono", label: "Typewriter" },
];
const ACCEPT = "image/jpeg,image/jpg,image/pjpeg,image/png,image/webp,.jpg,.jpeg,.jpe,.jfif,.png,.webp";
const DEFAULT_VIEW = { dx: 0, dy: 0, zoom: 1 };

function usePreviewWidth(): number {
  const [w, setW] = useState(360);
  useEffect(() => {
    const fit = () => {
      // Stacked layout (≤960px): preview is sticky, so cap it to ~40% of the viewport height.
      const maxH = window.innerWidth <= 960 ? window.innerHeight * 0.4 : window.innerHeight - 140;
      setW(Math.max(150, Math.min(420, window.innerWidth - 32, maxH * 0.5625)));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return w;
}

const stickerName = (st: Sticker) => STICKER_KINDS.find((k) => k.kind === st.kind)?.label ?? "Sticker";

export function Editor({ photos, story, setStory, input, suggested, music, onBack, onStartOver, onSave, signedIn = false, onAddPhotos }: Props) {
  const width = usePreviewWidth();
  const dispatch = (a: EditorAction) => setStory((cur) => (cur ? editorReducer(cur, a) : cur));
  const tpl = TEMPLATES[story.templateId];
  const [sel, setSel] = useState<Selection>(null);
  const [textTab, setTextTab] = useState<TextKey>("headline");
  const [exporting, setExporting] = useState<"idle" | "busy" | "error" | "done">("idle");
  const [saving, setSaving] = useState<{ kind: "idle" | "busy" | "done" } | { kind: "error"; msg: string }>({ kind: "idle" });
  const [uploadedCover, setUploadedCover] = useState<Photo | null>(null);
  const coverImg = useCoverImage(story.cover?.trackId, uploadedCover);
  const autoMasks = useMasks(photos, Boolean(tpl.needsMask), true);
  // Hand-refined cutouts per photo (CutoutRefiner); they override the automatic ones.
  const [maskEdits, setMaskEdits] = useState<ReadonlyMap<Photo, HTMLCanvasElement>>(() => new Map());
  const [refining, setRefining] = useState<number | null>(null);
  const masks = useMemo(() => autoMasks?.map((m, i) => maskEdits.get(photos[i]!) ?? m), [autoMasks, maskEdits, photos]);
  const art = useTrackArt((story.tracks ?? []).flatMap((t) => (t.trackId ? [t.trackId] : [])));
  const order = story.order?.length ? story.order : [0, 1, 2, 3];
  const boxes = slotRectsFor(story, photos.length);
  const lboxes = layoutBoxes(photos, story);
  const rel = (r: { x: number; y: number; w: number; h: number }) => ({ x: r.x / 1080, y: r.y / 1920, w: r.w / 1080, h: r.h / 1920 });
  const capacity = tpl.capacity ?? 1;
  const emptySlots = Math.max(0, Math.min(4, capacity) - photos.length);
  const pins = useMemo(() => pinsFor(story.templateId), [story.templateId]);
  const hasPanel = story.stickers.some((x) => x.kind === "spotify");
  const layoutEls = story.stickers.filter((x) => x.layout);

  // Any edit after saving makes "Save" available again (saves a new copy).
  useEffect(() => setSaving((cur) => (cur.kind === "done" ? { kind: "idle" } : cur)), [story]);
  // Drop a selection that no longer exists (deleted sticker, layout without a strip…).
  useEffect(() => {
    if (sel?.kind === "sticker" && !story.stickers.some((x) => x.id === sel.id)) setSel(null);
    if (sel?.kind === "spot" && !story.spot) setSel(null);
    if (sel?.kind === "cover" && !story.cover?.show) setSel(null);
  }, [sel, story]);

  // Playlist panel: fill with real tracks by the song's artist (Apple Music catalogue).
  const [tracksState, setTracksState] = useState<{ kind: "idle" | "busy" } | { kind: "error"; msg: string }>({ kind: "idle" });
  const [artistQuery, setArtistQuery] = useState("");
  const loadTracks = async (artist: string) => {
    if (artist.trim().length < 2) return;
    setTracksState({ kind: "busy" });
    try {
      const found = await searchTracks(artist.trim());
      const a = artist.trim().toLowerCase();
      const byArtist = found.filter((t) => t.artist.toLowerCase().includes(a));
      const list = (byArtist.length ? byArtist : found).slice(0, 10);
      dispatch({ type: "tracks", tracks: list.map((t) => ({ title: t.title, artist: t.artist, explicit: t.explicit, trackId: t.track_id })) });
      setTracksState(list.length ? { kind: "idle" } : { kind: "error", msg: "No songs found for that artist." });
    } catch (e) {
      setTracksState({ kind: "error", msg: e instanceof Error ? e.message : "Couldn't load songs." });
    }
  };
  const autoArtist = story.cover?.artist || music?.artist || "";
  const triedAuto = useRef("");
  useEffect(() => {
    if (!hasPanel || story.tracks?.length || !autoArtist || triedAuto.current === autoArtist) return;
    triedAuto.current = autoArtist;
    void loadTracks(autoArtist);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run when the panel/artist appears
  }, [hasPanel, autoArtist, story.tracks?.length]);

  const [adding, setAdding] = useState<{ kind: "idle" | "busy" } | { kind: "error"; msg: string }>({ kind: "idle" });
  const addInput = useRef<HTMLInputElement>(null);
  const addPhotos = async (files: FileList | null) => {
    if (!onAddPhotos) return;
    setAdding({ kind: "busy" });
    try {
      await onAddPhotos(files);
      setAdding({ kind: "idle" });
    } catch (e) {
      setAdding({ kind: "error", msg: e instanceof Error ? e.message : "Couldn't add that photo." });
    }
  };

  const doSave = async () => {
    if (!onSave) return;
    setSaving({ kind: "busy" });
    try {
      await onSave();
      setSaving({ kind: "done" });
      track("save", { layout: story.templateId });
    } catch (e) {
      if ((e as { code?: string }).code === "LOGIN_CANCELLED") return setSaving({ kind: "idle" });
      setSaving({ kind: "error", msg: e instanceof Error && e.message ? e.message : "Saving failed." });
    }
  };
  const doExport = async () => {
    setExporting("busy");
    try {
      const blob = await exportPng(photos, story, { cover: coverImg, masks, art });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = exportFilename(story);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setExporting("done");
      track("export", { layout: story.templateId });
    } catch {
      setExporting("error");
    }
  };

  // ---- framing helpers: own photo slots use their crop; repeats and insets use views ----
  const cropOf = (i: number): Crop => (i === 0 ? story.crop : (story.crops?.[i - 1] ?? story.crop));
  const ownSlot = (i: number) => i < photos.length;
  const viewOf = (key: string) => story.views?.[key] ?? DEFAULT_VIEW;
  const panBy = (target: Selection, dx: number, dy: number) => {
    if (!target) return;
    switch (target.kind) {
      case "text":
        return dispatch({ type: "move-by", key: target.key, dx, dy });
      case "sticker":
        return dispatch({ type: "sticker-move", id: target.id, dx, dy });
      case "spot":
        return dispatch({ type: "spot", dx, dy });
      case "cover":
        return dispatch({ type: "cover-move", dx, dy });
      case "view":
        // Turned layouts (Player Cutout) draw their pictures sideways: map the drag to match.
        if (tpl.slotTurn === 90) [dx, dy] = [dy, -dx];
        return dispatch({ type: "view", key: target.key, dx: -dx * 1.5, dy: -dy * 1.5 });
      case "box": {
        const b = lboxes.find((x) => x.key === target.key);
        return b && dispatch({ type: "box", key: target.key, from: rel(b.r), dx, dy });
      }
      case "slot": {
        // Photo drawn turned 90° (e.g. Player Cutout): finger right = photo up.
        if (tpl.slotTurn === 90) [dx, dy] = [dy, -dx];
        if (!ownSlot(target.i)) return dispatch({ type: "view", key: `slot${target.i}`, dx: -dx * 1.5, dy: -dy * 1.5 });
        const c = cropOf(target.i);
        return dispatch({ type: "crop", slot: target.i, patch: { x: c.x - dx * 1.5, y: c.y - dy * 1.5 } });
      }
    }
  };
  const zoomBy = (target: Selection, d: number) => {
    if (target?.kind === "view") return dispatch({ type: "view", key: target.key, zoom: 1 + d });
    if (target?.kind === "sticker") {
      const st = story.stickers.find((x) => x.id === target.id);
      return st && dispatch({ type: "sticker", id: st.id, patch: { scale: st.scale * (1 + d) } });
    }
    if (target?.kind === "cover" && story.cover) return dispatch({ type: "cover", patch: { scale: story.cover.scale * (1 + d) } });
    const i = target?.kind === "slot" ? target.i : 0;
    if (!ownSlot(i)) return dispatch({ type: "view", key: `slot${i}`, zoom: 1 + d });
    dispatch({ type: "crop", slot: i, patch: { zoom: cropOf(i).zoom * (1 + d) } });
  };

  // Arrow keys nudge the selection (Shift = bigger steps); Delete removes a sticker.
  const onKey = (e: React.KeyboardEvent) => {
    if (!sel) return;
    const step = e.shiftKey ? 0.02 : 0.004;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (d) {
      e.preventDefault();
      panBy(sel, d[0]!, d[1]!);
    } else if ((e.key === "Delete" || e.key === "Backspace") && sel.kind === "sticker") {
      e.preventDefault();
      dispatch({ type: "sticker-remove", id: sel.id });
    } else if (e.key === "Escape") setSel(null);
  };

  const chooseLayout = (id: TemplateId) => {
    dispatch({ type: "template", id, input: input(id) });
    track("layout_open", { layout: id });
    setSel(null);
  };

  // Everything selectable, so each element is reachable without hunting on the canvas.
  const selectables: { sel: Selection; label: string }[] = [
    { sel: { kind: "text", key: "headline" }, label: "Headline" },
    ...(story.caption.text ? [{ sel: { kind: "text", key: "caption" } as Selection, label: "Caption" }] : []),
    ...boxes.map((_, i) => ({ sel: { kind: "slot", i } as Selection, label: boxes.length > 1 ? `Photo box ${i + 1}` : "Photo" })),
    ...lboxes.map((b) => ({ sel: { kind: "box", key: b.key } as Selection, label: b.label })),
    ...(story.spot ? [{ sel: { kind: "spot" } as Selection, label: story.templateId === "colorbox" ? "Colour box" : "Strip" }] : []),
    ...(story.cover?.show ? [{ sel: { kind: "cover" } as Selection, label: "Song sticker" }] : []),
    ...story.stickers.map((st) => ({ sel: { kind: "sticker", id: st.id } as Selection, label: stickerName(st) })),
  ];
  const isSel = (x: Selection) => JSON.stringify(x) === JSON.stringify(sel);
  // Selecting on the canvas brings its controls into view.
  const inspectorRef = useRef<HTMLDivElement>(null);
  const selKey = JSON.stringify(sel);
  useEffect(() => {
    if (sel) inspectorRef.current?.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the selection changes
  }, [selKey]);

  return (
    <section className={s.editor} aria-label="Story editor">
      <div className={s.editorStage} tabIndex={0} onKeyDown={onKey} aria-label="Story canvas. Arrow keys move the selected element.">
        <StoryCanvas
          className={s.editorCanvas}
          photo={photos}
          state={story}
          cover={coverImg}
          masks={masks}
          width={width}
          label={`Editable ${tpl.name} Story. Tap anything to select it, drag to move it.`}
          selection={sel}
          onSelect={(x) => {
            setSel(x);
            if (x?.kind === "text") setTextTab(x.key);
          }}
          photoCount={photos.length}
          onDragText={(key, dx, dy) => dispatch({ type: "move-by", key, dx, dy })}
          onDragPhoto={(dx, dy, slot) => panBy({ kind: "slot", i: slot }, dx, dy)}
          onDragView={(key, dx, dy) => panBy({ kind: "view", key }, dx, dy)}
          onDragBox={(key, dx, dy) => panBy({ kind: "box", key }, dx, dy)}
          onDragSpot={(dx, dy) => dispatch({ type: "spot", dx, dy })}
          onDragCover={(dx, dy) => dispatch({ type: "cover-move", dx, dy })}
          onDragSticker={(id, dx, dy) => dispatch({ type: "sticker-move", id, dx, dy })}
          onSetCrop={(slot, crop) => dispatch({ type: "crop", slot, patch: crop })}
          onSwapSlots={photos.length > 1 ? (a, b) => dispatch({ type: "swap", a, b }) : undefined}
          onZoom={(d) => zoomBy(sel, d)}
        />
        <p className={s.small}>Tap to select · drag to move · scroll or pinch to zoom · arrow keys nudge</p>
        {tpl.needsMask && !masks && <p className={s.small} role="status">Cutting you out of the photo on your device (the first time loads a small model)…</p>}
        {tpl.needsMask && masks && <ModelProgress task="cutout" label="Sharpening your cutout" working="Sharpening your cutout on your device…" />}
        {tpl.needsMask && masks && !masks[0] && <p className={s.small} role="status">No person found to cut out, so this layout shows the whole photo. Use Refine cutout to paint one in.</p>}
        {tpl.needsMask && autoMasks && (
          <button type="button" className={s.linkBtn} onClick={() => setRefining(0)}>Cutout not quite right? Refine it</button>
        )}
      </div>

      <div className={s.panel}>
        <div className={s.panelHead}>
          {onBack ? <button className={s.linkBtn} onClick={onBack}>All suggestions</button> : <span />}
          <button className={s.linkBtn} onClick={onStartOver}>Start over</button>
        </div>

        {inspector()}

        <Section title="Layout" hint={tpl.name} open={false}>
          <div className={s.layoutGroups}>
            {suggested.length > 0 && (
              layoutGroup({ name: "Suggested for this photo", ids: suggested, open: true })
            )}
            {LAYOUT_GROUPS.map((g) => (
              <div key={g.id}>{layoutGroup({ name: g.name, ids: g.ids, open: groupOf(story.templateId)?.id === g.id })}</div>
            ))}
          </div>
          <a className={s.linkBtn} href="/gallery">Browse every layout and its Pinterest original</a>
        </Section>

        <Section title="This layout" hint={tpl.blurb} open>
          <div className={s.layoutMeta}>
            <NewBadge id={story.templateId} />
            <LikeButton id={story.templateId} />
            <span className={s.small}>Like it to help others find it.</span>
          </div>
          {pins.length > 0 && <PinSource pin={pins[0]!} more={pins.length - 1} moreHref={`/gallery?layout=${story.templateId}`} />}
          {tpl.needsMask && (
            <div className={s.subgroup}>
              <p className={s.subhead}>Cutout</p>
              <p className={s.small}>Paint to add anything the automatic cutout missed, or erase what it caught by mistake.</p>
              <div className={s.row}>
                {photos.map((p, i) => (
                  <button key={i} type="button" className={s.secondary} disabled={!autoMasks} onClick={() => setRefining(i)}>
                    {photos.length > 1 ? `Refine photo ${i + 1}` : "Refine cutout"}
                  </button>
                ))}
                {photos.some((p) => maskEdits.has(p)) && (
                  <button type="button" className={s.linkBtn} onClick={() => setMaskEdits(new Map())}>Use the automatic cutout</button>
                )}
              </div>
            </div>
          )}
          {tpl.outline && (
            <div className={s.subgroup}>
              <p className={s.subhead}>Cutout outline</p>
              <Toggle label="Outline around you" checked={story.outline?.show ?? true} onChange={(v) => dispatch({ type: "outline", patch: { show: v } })} />
              <Slider label="Thickness" value={story.outline?.width ?? 14} min={0} max={40} step={1} nudge={1} format={px} onChange={(v) => dispatch({ type: "outline", patch: { width: v } })} />
              <Slider label="Gap from you" value={story.outline?.margin ?? 0} min={0} max={60} step={1} nudge={1} format={px} onChange={(v) => dispatch({ type: "outline", patch: { margin: v } })} />
              <ColorField label="Outline colour" value={story.outline?.color ?? "#ffffff"} onChange={(v) => dispatch({ type: "outline", patch: { color: v } })} />
            </div>
          )}
          {story.spot && (
            <div className={s.subgroup}>
              <p className={s.subhead}>{story.templateId === "colorbox" ? "Colour box" : story.boxFilter ? "Filter box" : "Strip"}</p>
              {spotControls()}
              {story.boxFilter && (
                <div className={s.swatchGrid} role="group" aria-label="Look inside the box">
                  {FILTERS.filter((f) => f.id !== "none").map((f) => (
                    <button key={f.id} className={`${s.swatchBtn} ${story.boxFilter === f.id ? s.swatchOn : ""}`} aria-pressed={story.boxFilter === f.id} onClick={() => dispatch({ type: "box-filter", id: f.id })}>
                      <FilterSwatch photo={photos[order[0] ?? 0] ?? photos[0]!} filter={f.id} />
                      <span>{f.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {tpl.seeded && story.seed !== undefined && (
            <div className={s.subgroup}>
              <p className={s.subhead}>{tpl.seeded}</p>
              {story.lines && (
                <>
                  <Slider label="Distance from you" value={story.lines.gap} min={0} max={160} step={1} nudge={2} format={px} onChange={(v) => dispatch({ type: "lines", patch: { gap: v } })} />
                  <Slider label="Thickness" value={story.lines.width} min={2} max={30} step={1} nudge={1} format={px} onChange={(v) => dispatch({ type: "lines", patch: { width: v } })} />
                </>
              )}
              <Slider label="Variation" value={story.seed} min={0} max={99} step={1} nudge={1} format={(n) => (n ? String(n) : "default")} onChange={(v) => dispatch({ type: "seed", seed: v })} />
              <button type="button" className={s.secondary} onClick={() => dispatch({ type: "seed", seed: 1 + Math.floor(Math.random() * 99) })}>
                ↻ Shuffle lines
              </button>
            </div>
          )}
          <div className={s.subgroup}>
            <p className={s.subhead}>{tpl.overlayLabel}</p>
            <Slider label="Strength" value={story.overlay.strength} min={0} max={1} step={0.01} nudge={0.02} format={pct} onChange={(v) => dispatch({ type: "overlay", patch: { strength: v } })} />
            <ColorField label="Colour" value={story.overlay.color} onChange={(v) => dispatch({ type: "overlay", patch: { color: v } })} />
          </div>
          {tpl.decorations.length > 0 && (
            <div className={s.subgroup}>
              <p className={s.subhead}>Details</p>
              {tpl.decorations.map((d) => (
                <Toggle key={d.key} label={d.label} checked={story.decorations[d.key] !== false} onChange={(v) => dispatch({ type: "decoration", key: d.key, on: v })} />
              ))}
            </div>
          )}
          {(layoutEls.length > 0 || defaultElCount(story, input) > 0) && (
            <div className={s.subgroup}>
              <p className={s.subhead}>Elements placed by this layout</p>
              <div className={s.chips}>
                {layoutEls.map((st) => (
                  <button key={st.id} className={`${s.chip} ${isSel({ kind: "sticker", id: st.id }) ? s.chipOn : ""}`} onClick={() => setSel({ kind: "sticker", id: st.id })}>
                    {stickerName(st)}
                  </button>
                ))}
              </div>
              {layoutEls.length < defaultElCount(story, input) && (
                <button className={s.linkBtn} onClick={() => dispatch({ type: "restore-elements", input: input(story.templateId) })}>Bring back removed elements</button>
              )}
            </div>
          )}
          {tpl.prop && (
            <div className={s.subgroup}>
              <p className={s.subhead}>Second picture</p>
              {photos.length > 1 ? (
                <p className={s.small}>Showing your second photo. Remove it in Photos to use a prop shot again.</p>
              ) : (
                <>
                  <div className={s.propGrid} role="group" aria-label="Prop photo">
                    {PROPS.map((p) => (
                      <button key={p.id} className={`${s.propBtn} ${story.prop === p.id ? s.swatchOn : ""}`} aria-pressed={story.prop === p.id} aria-label={p.title} onClick={() => dispatch({ type: "prop", id: p.id })}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- local prop thumbnail */}
                        <img src={p.file} alt="" loading="lazy" />
                      </button>
                    ))}
                  </div>
                  <div className={s.row}>
                    <button className={s.secondary} onClick={() => dispatch({ type: "prop", id: nextProp(story.prop) })}>Shuffle</button>
                    {onAddPhotos && <button className={s.secondary} onClick={() => addInput.current?.click()}>Use my own photo</button>}
                  </div>
                  {propCredit()}
                </>
              )}
            </div>
          )}
          {hasPanel && (
            <div className={s.subgroup}>
              <p className={s.subhead}>Playlist songs</p>
              <p className={s.small}>Real songs from Apple Music by one artist{story.tracks?.length ? ` (showing ${story.tracks[0]!.artist})` : ""}.</p>
              <div className={s.searchRow}>
                <input className={s.input} value={artistQuery} maxLength={80} placeholder={autoArtist || "Artist name"} aria-label="Artist for the playlist" onChange={(e) => setArtistQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void loadTracks(artistQuery || autoArtist)} />
                <button className={s.secondary} disabled={tracksState.kind === "busy"} onClick={() => void loadTracks(artistQuery || autoArtist)}>
                  {tracksState.kind === "busy" ? "Loading…" : "Load songs"}
                </button>
              </div>
              {tracksState.kind === "error" && <p role="alert" className={s.error}>{tracksState.msg}</p>}
            </div>
          )}
        </Section>

        {(photos.length > 1 || capacity > 1 || boxes.length > 1) && (
          <Section title="Photos" hint={`${photos.length} of ${Math.max(capacity, photos.length)}`} open={photos.length > 1}>
            <p className={s.small}>
              {emptySlots > 0
                ? `Room for ${emptySlots} more photo${emptySlots > 1 ? "s" : ""}; empty boxes repeat your photos until you add more. Drag inside any box to choose what it shows.`
                : "Drag a photo onto another to swap them. Drag inside a box to reframe it."}
            </p>
            <div className={s.slotRow}>
              {boxes.slice(0, Math.max(photos.length, Math.min(4, capacity))).map((_, i) => (
                <div key={i} className={`${s.slotCard} ${isSel({ kind: "slot", i }) ? s.swatchOn : ""}`}>
                  <button className={s.slotThumb} onClick={() => setSel({ kind: "slot", i })} aria-label={`Select photo box ${i + 1}`}>
                    <PhotoThumb photo={photos[(order[i] ?? i) % photos.length]!} />
                    <span>Box {i + 1}</span>
                  </button>
                  {photos.length > 1 && (
                    <div className={s.row}>
                      <button className={s.chipX} disabled={i === 0} aria-label={`Move box ${i + 1} earlier`} onClick={() => dispatch({ type: "swap", a: i, b: i - 1 })}>←</button>
                      <button className={s.chipX} disabled={i >= photos.length - 1} aria-label={`Move box ${i + 1} later`} onClick={() => dispatch({ type: "swap", a: i, b: i + 1 })}>→</button>
                    </div>
                  )}
                </div>
              ))}
              {onAddPhotos && emptySlots > 0 && (
                <div className={s.slotCard}>
                  <button className={s.photoAddSmall} disabled={adding.kind === "busy"} onClick={() => addInput.current?.click()}>
                    {adding.kind === "busy" ? "Adding…" : "Add photo"}
                  </button>
                </div>
              )}
            </div>
            <input ref={addInput} type="file" multiple accept={ACCEPT} className={s.srOnly} aria-label="Add photos to this layout" onChange={(e) => { void addPhotos(e.target.files); e.target.value = ""; }} />
            {adding.kind === "error" && <p role="alert" className={s.error}>{adding.msg}</p>}
          </Section>
        )}

        <Section title="Look" hint={FILTERS.find((f) => f.id === story.filter)?.name}>
          <div className={s.swatchGrid} role="group" aria-label="Photo filter">
            {FILTERS.map((f) => (
              <button key={f.id} className={`${s.swatchBtn} ${story.filter === f.id ? s.swatchOn : ""}`} aria-pressed={story.filter === f.id} onClick={() => dispatch({ type: "filter", id: f.id })}>
                <FilterSwatch photo={photos[order[0] ?? 0] ?? photos[0]!} filter={f.id} />
                <span>{f.name}</span>
              </button>
            ))}
          </div>
        </Section>

        <Section title="Text" hint={story.headline.text.slice(0, 28)}>
          <Segmented label="Text layer" value={textTab} options={[{ id: "headline", label: "Headline" }, { id: "caption", label: "Caption" }]} onChange={(k) => { setTextTab(k); setSel({ kind: "text", key: k }); }} />
          {textControls({ k: textTab })}
        </Section>

        <Section title="Stickers & elements" hint={`${story.stickers.length} on the Story`}>
          <div className={s.swatchGrid} role="group" aria-label="Add a sticker">
            {STICKER_KINDS.map((k) => (
              <button
                key={k.kind}
                className={s.swatchBtn}
                onClick={() => {
                  const st = newSticker(k.kind, k.kind === "player" ? (music?.title ?? music?.artist ?? undefined) : undefined);
                  dispatch({ type: "sticker-add", sticker: k.kind === "spotify" ? { ...st, scale: 0.9, rotate: 0 } : st });
                  setSel({ kind: "sticker", id: st.id });
                }}
              >
                <StickerSwatch kind={k.kind} color={k.color} />
                <span>{k.label}</span>
              </button>
            ))}
          </div>
        </Section>

        {story.cover && (
          <Section title="Song sticker" hint={story.cover.show ? story.cover.title || "On" : "Off"} open={Boolean(tpl.cover?.show)}>
            <CoverPanel
              cover={story.cover}
              onChange={(patch) => dispatch({ type: "cover", patch })}
              onUpload={setUploadedCover}
              focus={story.focus ?? { x: story.crop.x, y: story.crop.y }}
              hasImage={Boolean(coverImg)}
            />
          </Section>
        )}

        <div className={s.exportBar}>
          <button className={s.primary} onClick={doExport} disabled={exporting === "busy"}>
            {exporting === "busy" ? "Rendering…" : "Download PNG"}
          </button>
          {onSave && (
            <button className={s.secondary} onClick={doSave} disabled={saving.kind === "busy" || saving.kind === "done"}>
              {saving.kind === "busy" ? "Saving…" : saving.kind === "done" ? "Saved" : signedIn ? "Save to my Stories" : "Log in to save"}
            </button>
          )}
          <button className={s.linkBtn} onClick={() => { dispatch({ type: "reset", input: input(story.templateId) }); setSel(null); }}>Reset layout</button>
        </div>
        <div aria-live="polite">
          {saving.kind === "error" && <p className={s.error}>{saving.msg} <button className={s.linkBtn} onClick={doSave}>Try again</button></p>}
          {saving.kind === "done" && <p className={s.small}>Saved to your account. Find it under &ldquo;Your saved Stories&rdquo; on any device; the photo copy is stored privately.</p>}
          {exporting === "error" && <p className={s.error}>Export failed. <button className={s.linkBtn} onClick={doExport}>Try again</button></p>}
          {exporting === "done" && (
            <p className={s.small}>
              Downloaded. Post it as a Story, then add the song with Instagram&apos;s Music sticker.{" "}
              <button className={s.linkBtn} onClick={onStartOver}>Make another</button>
            </p>
          )}
        </div>
        {music && music.kind !== "none" && <MusicCard music={music} />}
      </div>
      {refining !== null && autoMasks && photos[refining] && (
        <CutoutRefiner
          photo={photos[refining]}
          start={maskEdits.get(photos[refining]) ?? autoMasks[refining] ?? null}
          auto={autoMasks[refining] ?? null}
          title={photos.length > 1 ? `Refine photo ${refining + 1}` : "Refine your cutout"}
          onApply={(m) => {
            const photo = photos[refining]!;
            setMaskEdits((cur) => new Map(cur).set(photo, m));
            setRefining(null);
          }}
          onClose={() => setRefining(null)}
        />
      )}
    </section>
  );

  // ---- pieces (closures over the editor state) -------------------------------------------

  function layoutGroup({ name, ids, open }: { name: string; ids: TemplateId[]; open?: boolean }) {
    return (
      <details className={s.layoutGroup} open={open}>
        <summary>
          {name} <span className={s.muted}>{ids.length}</span>
        </summary>
        <div className={s.chips}>
          {ids.map((id) => (
            <button key={id} className={`${s.chip} ${story.templateId === id ? s.chipOn : ""}`} aria-pressed={story.templateId === id} onClick={() => chooseLayout(id)}>
              {TEMPLATES[id].name}
              {suggested.includes(id) && <span className={s.dot} aria-label="suggested" />}
            </button>
          ))}
        </div>
      </details>
    );
  }

  function propCredit() {
    const p = PROPS.find((x) => x.id === story.prop);
    if (!p) return null;
    return (
      <p className={s.small}>
        Photo: <a href={p.source} target="_blank" rel="noopener noreferrer">{p.title}</a>
        {p.creator !== "unknown" && <> by {p.creatorUrl ? <a href={p.creatorUrl} target="_blank" rel="noopener noreferrer">{p.creator}</a> : p.creator}</>} ·{" "}
        {p.licenseUrl ? <a href={p.licenseUrl} target="_blank" rel="noopener noreferrer">{p.license}</a> : p.license}
      </p>
    );
  }

  function spotControls() {
    const sp = story.spot!;
    const full = sp.w >= 0.99;
    return (
      <>
        {!full && <Slider label="Left ↔ right" value={sp.x} min={0} max={1 - sp.w} step={0.001} nudge={0.005} format={pct} onChange={(v) => dispatch({ type: "spot", x: v })} />}
        <Slider label="Up ↕ down" value={sp.y} min={0} max={1 - sp.h} step={0.001} nudge={0.005} format={pct} onChange={(v) => dispatch({ type: "spot", y: v })} />
        {!full && <Slider label="Width" value={sp.w} min={0.08} max={1} step={0.005} nudge={0.01} format={pct} onChange={(v) => dispatch({ type: "spot", w: v })} />}
        <Slider label="Height" value={sp.h} min={0.04} max={0.6} step={0.005} nudge={0.01} format={pct} onChange={(v) => dispatch({ type: "spot", h: v })} />
        {story.templateId === "tornstrip" && (
          <>
            <p className={s.subhead}>Inside the strip</p>
            {boxControls({ viewKey: "band" })}
          </>
        )}
      </>
    );
  }

  function textControls({ k }: { k: TextKey }) {
    const layer = story[k];
    return (
      <>
        <label className={s.field}>
          <span>Words</span>
          <textarea className={s.input} rows={2} maxLength={160} value={layer.text} onChange={(e) => dispatch({ type: "text", key: k, patch: { text: e.target.value } })} />
        </label>
        <div className={s.grid2}>
          <FontPicker
            layer={layer}
            layoutRole={TEMPLATES[story.templateId].defaults(input(story.templateId))[k].font}
            onChange={(patch) => dispatch({ type: "text", key: k, patch })}
          />
          <ColorField label="Colour" value={layer.color} onChange={(v) => dispatch({ type: "text", key: k, patch: { color: v } })} />
        </div>
        <Slider label="Size" value={layer.size} min={14} max={240} step={1} nudge={2} format={px} onChange={(v) => dispatch({ type: "text", key: k, patch: { size: v } })} />
        <Slider label="Line width" value={layer.width} min={0.2} max={1.2} step={0.01} nudge={0.02} format={pct} onChange={(v) => dispatch({ type: "text", key: k, patch: { width: v } })} />
        <Segmented<Align> label="Alignment" value={layer.align} options={[{ id: "left", label: "Left" }, { id: "center", label: "Centre" }, { id: "right", label: "Right" }]} onChange={(al) => dispatch({ type: "text", key: k, patch: { align: al } })} />
        <Slider label="Left ↔ right" value={layer.x} min={0} max={1} step={0.001} nudge={0.005} format={pct} onChange={(v) => dispatch({ type: "move", key: k, x: v, y: layer.y })} />
        <Slider label="Up ↕ down" value={layer.y} min={0} max={0.97} step={0.001} nudge={0.005} format={pct} onChange={(v) => dispatch({ type: "move", key: k, x: layer.x, y: v })} />
      </>
    );
  }

  function boxControls({ i, viewKey }: { i?: number; viewKey?: string }) {
    const own = i !== undefined && ownSlot(i) && !viewKey;
    if (own) {
      const c = cropOf(i);
      return (
        <>
          <Segmented label="Photo fit" value={c.fit} options={[{ id: "cover", label: "Fill box" }, { id: "contain", label: "Whole photo" }]} onChange={(fit) => dispatch({ type: "crop", slot: i, patch: { fit } })} />
          <Slider label="Zoom" value={c.zoom} min={1} max={4} step={0.01} nudge={0.05} format={times} onChange={(v) => dispatch({ type: "crop", slot: i, patch: { zoom: v } })} />
          <Slider label="Left ↔ right" value={c.x} min={0} max={1} step={0.001} nudge={0.01} format={pct} onChange={(v) => dispatch({ type: "crop", slot: i, patch: { x: v } })} />
          <Slider label="Up ↕ down" value={c.y} min={0} max={1} step={0.001} nudge={0.01} format={pct} onChange={(v) => dispatch({ type: "crop", slot: i, patch: { y: v } })} />
          <div className={s.row}>
            <button className={s.secondary} onClick={() => dispatch({ type: "crop", slot: i, patch: { rot: ((((c.rot ?? 0) + 90) % 360) as Crop["rot"]) } })}>Rotate photo 90°</button>
            <button className={s.linkBtn} onClick={() => dispatch({ type: "crop", slot: i, patch: { zoom: 1, x: 0.5, y: 0.5, fit: "cover", rot: 0 } })}>Reset framing</button>
          </div>
          {tpl.needsMask && (
            <button className={s.secondary} disabled={!autoMasks} onClick={() => setRefining((order[i] ?? i) % photos.length)}>Refine cutout (add / erase)</button>
          )}
        </>
      );
    }
    const key = viewKey ?? `slot${i}`;
    const v = viewOf(key);
    const set = (patch: Partial<typeof v>) =>
      dispatch({ type: "view", key, dx: (patch.dx ?? v.dx) - v.dx, dy: (patch.dy ?? v.dy) - v.dy, zoom: (patch.zoom ?? v.zoom) / v.zoom });
    return (
      <>
        <p className={s.small}>This box shows part of your photo. Drag inside it, or use these, to choose which part.</p>
        <Slider label="Zoom" value={v.zoom} min={0.5} max={4} step={0.01} nudge={0.05} format={times} onChange={(z) => set({ zoom: z })} />
        <Slider label="Left ↔ right" value={-v.dx} min={-1} max={1} step={0.001} nudge={0.01} format={(n) => n.toFixed(2)} onChange={(n) => set({ dx: -n })} />
        <Slider label="Up ↕ down" value={-v.dy} min={-1} max={1} step={0.001} nudge={0.01} format={(n) => n.toFixed(2)} onChange={(n) => set({ dy: -n })} />
        <button className={s.linkBtn} onClick={() => dispatch({ type: "view", key, reset: true })}>Reset this box</button>
      </>
    );
  }

  function stickerControls({ st }: { st: Sticker }) {
    const patch = (p: Partial<Sticker>) => dispatch({ type: "sticker", id: st.id, patch: p });
    return (
      <>
        <Slider label="Size" value={st.scale} min={0.3} max={5} step={0.01} nudge={0.05} format={times} onChange={(v) => patch({ scale: v })} />
        <Slider label="Rotation" value={st.rotate} min={0} max={359} step={1} nudge={1} format={deg} onChange={(v) => patch({ rotate: v })} />
        <Slider label="Left ↔ right" value={st.x} min={0} max={1} step={0.001} nudge={0.005} format={pct} onChange={(v) => patch({ x: v })} />
        <Slider label="Up ↕ down" value={st.y} min={0} max={1} step={0.001} nudge={0.005} format={pct} onChange={(v) => patch({ y: v })} />
        <ColorField label="Colour" value={st.color} onChange={(v) => patch({ color: v })} />
        {(st.kind === "note" || st.kind === "player") && (
          <label className={s.field}>
            <span>Words</span>
            <input className={s.input} maxLength={28} value={st.text ?? ""} onChange={(e) => patch({ text: e.target.value })} />
          </label>
        )}
        <div className={s.row}>
          <button className={s.secondary} onClick={() => patch({ rotate: (st.rotate + 90) % 360 })}>Turn 90°</button>
          <button className={s.secondary} onClick={() => dispatch({ type: "sticker-order", id: st.id, to: "front" })}>Bring to front</button>
          <button className={s.secondary} onClick={() => dispatch({ type: "sticker-order", id: st.id, to: "back" })}>Send to back</button>
          <button
            className={s.secondary}
            onClick={() => {
              const copy = { ...st, id: `${st.kind}-${Date.now().toString(36)}`, x: Math.min(1, st.x + 0.04), y: Math.min(1, st.y + 0.03), layout: undefined };
              dispatch({ type: "sticker-add", sticker: copy });
              setSel({ kind: "sticker", id: copy.id });
            }}
          >
            Duplicate
          </button>
          <button className={s.danger} onClick={() => dispatch({ type: "sticker-remove", id: st.id })}>Delete</button>
        </div>
      </>
    );
  }

  function inspector() {
    let title = "Nothing selected";
    let body: React.ReactNode = <p className={s.small}>Tap anything on the Story to adjust it, or pick it here.</p>;
    if (sel?.kind === "text") {
      title = sel.key === "headline" ? "Headline" : "Caption";
      body = textControls({ k: sel.key });
    } else if (sel?.kind === "sticker") {
      const st = story.stickers.find((x) => x.id === sel.id);
      if (st) {
        title = stickerName(st);
        body = stickerControls({ st });
      }
    } else if (sel?.kind === "slot") {
      title = boxes.length > 1 ? `Photo box ${sel.i + 1}` : "Photo";
      body = boxControls({ i: sel.i });
    } else if (sel?.kind === "view") {
      title = sel.key.startsWith("slot") ? `Photo box ${Number(sel.key.slice(4)) + 1}` : "Zoomed box";
      body = boxControls({ viewKey: sel.key });
    } else if (sel?.kind === "box") {
      const b = lboxes.find((x) => x.key === sel.key);
      if (b) {
        const r = rel(b.r);
        const set = (patch: Partial<typeof r>) => dispatch({ type: "box", key: b.key, from: r, ...patch });
        title = b.label;
        body = (
          <>
            <p className={s.small}>Drag its frame on the Story to move it{b.image ? "; drag inside to choose which part of the photo it shows" : ""}.</p>
            <Slider label="Left ↔ right" value={r.x} min={-r.w / 2} max={1 - r.w / 2} step={0.001} nudge={0.005} format={pct} onChange={(v) => set({ x: v })} />
            <Slider label="Up ↕ down" value={r.y} min={-r.h / 2} max={1 - r.h / 2} step={0.001} nudge={0.005} format={pct} onChange={(v) => set({ y: v })} />
            <Slider label="Width" value={r.w} min={0.03} max={1} step={0.002} nudge={0.01} format={pct} onChange={(v) => set({ w: v })} />
            <Slider label="Height" value={r.h} min={0.02} max={1} step={0.002} nudge={0.01} format={pct} onChange={(v) => set({ h: v })} />
            {b.layer && (
              <Segmented label="Layer" value={story.decorations[b.layer] !== false ? "behind" : "front"} options={[{ id: "behind", label: "Behind you" }, { id: "front", label: "In front of you" }]} onChange={(v) => dispatch({ type: "decoration", key: b.layer!, on: v === "behind" })} />
            )}
            {b.tinted && (
              <>
                <Slider label="Opacity" value={story.overlay.strength} min={0} max={1} step={0.01} nudge={0.02} format={pct} onChange={(v) => dispatch({ type: "overlay", patch: { strength: v } })} />
                <ColorField label="Colour" value={story.overlay.color} onChange={(v) => dispatch({ type: "overlay", patch: { color: v } })} />
              </>
            )}
            {b.image && boxControls({ viewKey: b.key })}
            <button className={s.linkBtn} onClick={() => dispatch({ type: "box", key: b.key, from: r, reset: true })}>Put it back</button>
          </>
        );
      }
    } else if (sel?.kind === "spot" && story.spot) {
      title = story.templateId === "colorbox" ? "Colour box" : "Strip";
      body = spotControls();
    } else if (sel?.kind === "cover" && story.cover) {
      const c = story.cover;
      title = "Song sticker";
      body = (
        <>
          <Slider label="Size" value={c.scale} min={0.3} max={4} step={0.01} nudge={0.05} format={times} onChange={(v) => dispatch({ type: "cover", patch: { scale: v } })} />
          <Slider label="Tilt" value={c.rotate} min={-45} max={45} step={1} nudge={1} format={deg} onChange={(v) => dispatch({ type: "cover", patch: { rotate: v } })} />
          <Slider label="Left ↔ right" value={c.x} min={0} max={1} step={0.001} nudge={0.005} format={pct} onChange={(v) => dispatch({ type: "cover", patch: { x: v } })} />
          <Slider label="Up ↕ down" value={c.y} min={0} max={1} step={0.001} nudge={0.005} format={pct} onChange={(v) => dispatch({ type: "cover", patch: { y: v } })} />
          <p className={s.small}>Pick the song, style and title colour under Song sticker.</p>
        </>
      );
    }
    return (
      <div ref={inspectorRef} className={s.inspector} aria-live="polite">
        <div className={s.inspectorHead}>
          <h3>{title}</h3>
          {sel && <button className={s.linkBtn} onClick={() => setSel(null)}>Done</button>}
        </div>
        {body}
        <div className={s.selectables} role="group" aria-label="Select an element">
          {selectables.map((x) => (
            <button key={JSON.stringify(x.sel)} className={`${s.chip} ${isSel(x.sel) ? s.chipOn : ""}`} aria-pressed={isSel(x.sel)} onClick={() => setSel(x.sel)}>
              {x.label}
            </button>
          ))}
        </div>
      </div>
    );
  }
}

/** A different prop photo than the current one (deterministic cycle with a skip). */
function nextProp(cur?: string): string {
  const i = PROPS.findIndex((p) => p.id === cur);
  return PROPS[(i + 3 + PROPS.length) % PROPS.length]!.id;
}

/** How many elements this layout places by default (to offer restoring deleted ones). */
function defaultElCount(s: StoryState, input: (id: TemplateId) => TemplateInput): number {
  return TEMPLATES[s.templateId].stickers?.(input(s.templateId)).length ?? 0;
}

/** One font menu: the layout's own fonts (its default first), curated Google Fonts, or any
 *  Google Font typed in. Switching layouts goes back to that layout's font. */
function FontPicker({ layer, layoutRole, onChange }: { layer: TextLayer; layoutRole: FontRole; onChange: (p: Partial<TextLayer>) => void }) {
  const [typing, setTyping] = useState(false);
  const [name, setName] = useState("");
  const custom = layer.family && !GOOGLE_FONTS.some((f) => f.family === layer.family) ? layer.family : null;
  const value = layer.family ? `g:${layer.family}` : layer.font === layoutRole ? "default" : `r:${layer.font}`;
  const groups = [...new Set(GOOGLE_FONTS.map((f) => f.group))];
  const pick = (v: string) => {
    if (v === "other") return setTyping(true);
    setTyping(false);
    if (v === "default") onChange({ font: layoutRole, family: undefined });
    else if (v.startsWith("r:")) onChange({ font: v.slice(2) as FontRole, family: undefined });
    else onChange({ family: v.slice(2) });
  };
  const apply = () => {
    const f = name.trim().replace(/\s+/g, " ");
    if (FAMILY_RE.test(f)) {
      onChange({ family: f });
      setTyping(false);
    }
  };
  return (
    <div className={s.field}>
      <label className={s.field}>
        <span>Font</span>
        <select className={s.select} value={typing ? "other" : value} onChange={(e) => pick(e.target.value)}>
          <optgroup label="This layout">
            <option value="default">Layout default — {ROLE_FONTS[layoutRole]}</option>
            {FONTS.filter((f) => f.id !== layoutRole).map((f) => (
              <option key={f.id} value={`r:${f.id}`}>{f.label} — {ROLE_FONTS[f.id]}</option>
            ))}
          </optgroup>
          {groups.map((g) => (
            <optgroup key={g} label={`Google Fonts · ${g}`}>
              {GOOGLE_FONTS.filter((f) => f.group === g).map((f) => (
                <option key={f.family} value={`g:${f.family}`}>{f.family}</option>
              ))}
            </optgroup>
          ))}
          {custom && <option value={`g:${custom}`}>{custom}</option>}
          <option value="other">Other Google Font…</option>
        </select>
      </label>
      {typing && (
        <div className={s.row}>
          <input
            className={s.input}
            value={name}
            maxLength={40}
            placeholder="e.g. Space Grotesk"
            aria-label="Google Font name"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && apply()}
          />
          <button type="button" className={s.secondary} disabled={!FAMILY_RE.test(name.trim())} onClick={apply}>Use</button>
        </div>
      )}
      {layer.family && fontFailed(layer.family) && <p className={s.error}>Google Fonts has no “{layer.family}” — showing the layout font instead.</p>}
    </div>
  );
}
