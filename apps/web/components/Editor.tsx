"use client";

import { useEffect, useRef, useState } from "react";
import type { Music } from "../lib/api";
import type { Photo } from "../lib/story/draw";
import { type EditorAction, editorReducer } from "../lib/story/editor";
import { exportFilename, exportPng } from "../lib/story/export";
import { TEMPLATES } from "../lib/story/templates";
import type { Align, FontRole, StoryState, TemplateId, TemplateInput, TextKey } from "../lib/story/types";
import { TEMPLATE_IDS } from "../lib/story/types";
import { FILTERS } from "../lib/story/filters";
import { STICKER_KINDS, newSticker } from "../lib/story/stickers";
import { FilterSwatch, PhotoThumb, StickerSwatch } from "./Swatches";
import { slotRectsFor } from "../lib/story/templates";
import { MusicCard } from "./Results";
import { StoryCanvas } from "./StoryCanvas";
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

export function Editor({ photos, story, setStory, input, suggested, music, onBack, onStartOver, onSave, signedIn = false, onAddPhotos }: Props) {
  const [active, setActive] = useState<TextKey>("headline");
  const [exporting, setExporting] = useState<"idle" | "busy" | "error" | "done">("idle");
  const [saving, setSaving] = useState<{ kind: "idle" | "busy" | "done" } | { kind: "error"; msg: string }>({ kind: "idle" });
  // Any edit after saving makes "Save" available again (saves a new copy).
  useEffect(() => setSaving((cur) => (cur.kind === "done" ? { kind: "idle" } : cur)), [story]);
  const doSave = async () => {
    if (!onSave) return;
    setSaving({ kind: "busy" });
    try {
      await onSave();
      setSaving({ kind: "done" });
    } catch (e) {
      if ((e as { code?: string }).code === "LOGIN_CANCELLED") return setSaving({ kind: "idle" });
      setSaving({ kind: "error", msg: e instanceof Error && e.message ? e.message : "Saving failed." });
    }
  };
  const width = usePreviewWidth();
  const dispatch = (a: EditorAction) => setStory((cur) => (cur ? editorReducer(cur, a) : cur));
  const tpl = TEMPLATES[story.templateId];
  const layer = story[active];
  const [selected, setSelected] = useState<string | null>(null);
  // Which photo slot the Crop controls act on (multi-photo layouts).
  const slotCount = Math.min(photos.length, slotRectsFor(story, photos.length).length);
  const [slotRaw, setSlot] = useState(0);
  const slot = Math.min(slotRaw, Math.max(0, slotCount - 1));
  const cropOf = (i: number) => (i === 0 ? story.crop : (story.crops?.[i - 1] ?? story.crop));
  const crop = cropOf(slot);
  const order = story.order?.length ? story.order : [0, 1, 2, 3];
  const capacity = TEMPLATES[story.templateId].capacity ?? 1;
  const emptySlots = Math.max(0, Math.min(4, capacity) - photos.length);
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
  const sticker = story.stickers.find((x) => x.id === selected) ?? null;

  const doExport = async () => {
    setExporting("busy");
    try {
      const blob = await exportPng(photos, story);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = exportFilename(story);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setExporting("done");
    } catch {
      setExporting("error");
    }
  };

  return (
    <section className={s.editor} aria-label="Story editor">
      <div className={s.editorStage}>
        <StoryCanvas
          className={s.editorCanvas}
          photo={photos}
          state={story}
          width={width}
          label={`Editable ${tpl.name} Story. Drag text to move it, drag elsewhere to reposition the photo.`}
          onSelectText={setActive}
          onDragText={(key, dx, dy) => dispatch({ type: "move", key, x: story[key].x + dx, y: story[key].y + dy })}
          onDragPhoto={(dx, dy, slot) => {
            const c = cropOf(slot);
            setSlot(slot);
            dispatch({ type: "crop", slot, patch: { x: c.x - dx * 1.5, y: c.y - dy * 1.5 } });
          }}
          onSetCrop={(slot, crop) => dispatch({ type: "crop", slot, patch: crop })}
          onSwapSlots={photos.length > 1 ? (a, b) => dispatch({ type: "swap", a, b }) : undefined}
          onSelectSlot={setSlot}
          onDragSticker={(id, dx, dy) => {
            const st = story.stickers.find((x) => x.id === id);
            if (st) dispatch({ type: "sticker", id, patch: { x: st.x + dx, y: st.y + dy } });
          }}
          onSelectSticker={setSelected}
          selectedSticker={selected}
          onZoom={(d) => dispatch({ type: "crop", slot, patch: { zoom: crop.zoom * (1 + d) } })}
        />
        <p className={s.small}>Drag text, stickers or the photo · scroll/pinch to zoom · exports at 1080 × 1920</p>
      </div>

      <div className={s.panel}>
        <div className={s.panelHead}>
          {onBack ? <button className={s.linkBtn} onClick={onBack}>← All suggestions</button> : <span />}
          <button className={s.linkBtn} onClick={onStartOver}>Start over</button>
        </div>

        <fieldset className={s.group}>
          <legend>Layout</legend>
          <div className={s.chips}>
            {TEMPLATE_IDS.map((id) => (
              <button
                key={id}
                className={`${s.chip} ${story.templateId === id ? s.chipOn : ""}`}
                aria-pressed={story.templateId === id}
                onClick={() => dispatch({ type: "template", id, input: input(id) })}
              >
                {TEMPLATES[id].name}
                {suggested.includes(id) && <span className={s.dot} aria-label="suggested" />}
              </button>
            ))}
          </div>
        </fieldset>

        {(photos.length > 1 || capacity > 1) && (
          <fieldset className={s.group}>
            <legend>Photos</legend>
            <p className={s.small}>
              {slotCount < photos.length
                ? `This layout shows ${slotCount} of your ${photos.length} photos — switch layouts to show all.`
                : emptySlots > 0
                  ? `This layout has room for ${emptySlots} more photo${emptySlots > 1 ? "s" : ""} — empty slots repeat your photos until you add more.`
                  : "Drag a photo onto another on the Story to swap them, or use the arrows."}
            </p>
            <div className={s.slotRow}>
              {Array.from({ length: slotCount }, (_, i) => (
                <div key={i} className={`${s.slotCard} ${slot === i ? s.swatchOn : ""}`}>
                  <button className={s.slotThumb} onClick={() => setSlot(i)} aria-label={`Edit crop of photo slot ${i + 1}`} aria-pressed={slot === i}>
                    <PhotoThumb photo={photos[(order[i] ?? i) % photos.length]!} />
                    <span>Slot {i + 1}</span>
                  </button>
                  <div className={s.row}>
                    <button className={s.chipX} disabled={i === 0} aria-label={`Move slot ${i + 1} earlier`} onClick={() => { dispatch({ type: "swap", a: i, b: i - 1 }); setSlot(i - 1); }}>←</button>
                    <button className={s.chipX} disabled={i === slotCount - 1} aria-label={`Move slot ${i + 1} later`} onClick={() => { dispatch({ type: "swap", a: i, b: i + 1 }); setSlot(i + 1); }}>→</button>
                  </div>
                </div>
              ))}
              {onAddPhotos && emptySlots > 0 && (
                <div className={s.slotCard}>
                  <button className={s.photoAddSmall} disabled={adding.kind === "busy"} onClick={() => addInput.current?.click()}>
                    {adding.kind === "busy" ? "Adding…" : "+ Add photo"}
                  </button>
                </div>
              )}
            </div>
            <input
              ref={addInput}
              type="file"
              multiple
              accept="image/jpeg,image/jpg,image/pjpeg,image/png,image/webp,.jpg,.jpeg,.jpe,.jfif,.png,.webp"
              className={s.srOnly}
              aria-label="Add photos to this layout"
              onChange={(e) => {
                void addPhotos(e.target.files);
                e.target.value = "";
              }}
            />
            {adding.kind === "error" && <p role="alert" className={s.error}>{adding.msg}</p>}
          </fieldset>
        )}

        <fieldset className={s.group}>
          <legend>Crop{slotCount > 1 ? ` · slot ${slot + 1}` : ""}</legend>
          <div className={s.segment} role="group" aria-label="Photo fit">
            {(["cover", "contain"] as const).map((fit) => (
              <button key={fit} aria-pressed={crop.fit === fit} className={crop.fit === fit ? s.segOn : ""} onClick={() => dispatch({ type: "crop", slot, patch: { fit } })}>
                {fit === "cover" ? "Fill frame" : "Fit whole photo"}
              </button>
            ))}
          </div>
          <label className={s.field}>
            <span>Zoom · {crop.zoom.toFixed(2)}×</span>
            <input type="range" min={1} max={4} step={0.01} value={crop.zoom} onChange={(e) => dispatch({ type: "crop", slot, patch: { zoom: Number(e.target.value) } })} />
          </label>
          <div className={s.grid2}>
            <label className={s.field}>
              <span>Left ↔ right</span>
              <input type="range" min={0} max={1} step={0.01} value={crop.x} onChange={(e) => dispatch({ type: "crop", slot, patch: { x: Number(e.target.value) } })} />
            </label>
            <label className={s.field}>
              <span>Top ↕ bottom</span>
              <input type="range" min={0} max={1} step={0.01} value={crop.y} onChange={(e) => dispatch({ type: "crop", slot, patch: { y: Number(e.target.value) } })} />
            </label>
          </div>
          <p className={s.small}>
            Drag the photo to reframe · scroll or pinch to zoom ·{" "}
            <button className={s.linkBtn} onClick={() => dispatch({ type: "crop", slot, patch: { zoom: 1, x: 0.5, y: 0.5, fit: "cover" } })}>Reset crop</button>
          </p>
        </fieldset>

        <fieldset className={s.group}>
          <legend>Filter</legend>
          <div className={s.swatchGrid} role="group" aria-label="Photo filter">
            {FILTERS.map((f) => (
              <button key={f.id} className={`${s.swatchBtn} ${story.filter === f.id ? s.swatchOn : ""}`} aria-pressed={story.filter === f.id} onClick={() => dispatch({ type: "filter", id: f.id })}>
                <FilterSwatch photo={photos[order[0] ?? 0] ?? photos[0]!} filter={f.id} />
                <span>{f.name}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className={s.group}>
          <legend>Text</legend>
          <div className={s.segment} role="tablist">
            {(["headline", "caption"] as const).map((k) => (
              <button key={k} role="tab" aria-selected={active === k} className={active === k ? s.segOn : ""} onClick={() => setActive(k)}>
                {k === "headline" ? "Headline" : "Caption"}
              </button>
            ))}
          </div>
          <label className={s.field}>
            <span>Words</span>
            <textarea
              className={s.input}
              rows={2}
              maxLength={160}
              value={layer.text}
              onChange={(e) => dispatch({ type: "text", key: active, patch: { text: e.target.value } })}
            />
          </label>
          <div className={s.grid2}>
            <label className={s.field}>
              <span>Typeface</span>
              <select className={s.select} value={layer.font} onChange={(e) => dispatch({ type: "text", key: active, patch: { font: e.target.value as FontRole } })}>
                {FONTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </label>
            <label className={s.field}>
              <span>Colour</span>
              <input type="color" className={s.color} value={layer.color} onChange={(e) => dispatch({ type: "text", key: active, patch: { color: e.target.value } })} />
            </label>
          </div>
          <label className={s.field}>
            <span>Size · {Math.round(layer.size)}px</span>
            <input type="range" min={14} max={200} value={layer.size} onChange={(e) => dispatch({ type: "text", key: active, patch: { size: Number(e.target.value) } })} />
          </label>
          <div className={s.segment} role="group" aria-label="Alignment">
            {(["left", "center", "right"] as Align[]).map((al) => (
              <button key={al} aria-pressed={layer.align === al} className={layer.align === al ? s.segOn : ""} onClick={() => dispatch({ type: "text", key: active, patch: { align: al } })}>
                {al}
              </button>
            ))}
          </div>
          <div className={s.grid2}>
            <label className={s.field}>
              <span>Horizontal</span>
              <input type="range" min={0} max={1} step={0.01} value={layer.x} onChange={(e) => dispatch({ type: "move", key: active, x: Number(e.target.value), y: layer.y })} />
            </label>
            <label className={s.field}>
              <span>Vertical</span>
              <input type="range" min={0} max={0.97} step={0.005} value={layer.y} onChange={(e) => dispatch({ type: "move", key: active, x: layer.x, y: Number(e.target.value) })} />
            </label>
          </div>
        </fieldset>

        <fieldset className={s.group}>
          <legend>Stickers &amp; paper</legend>
          <div className={s.swatchGrid} role="group" aria-label="Add a sticker">
            {STICKER_KINDS.map((k) => (
              <button
                key={k.kind}
                className={s.swatchBtn}
                onClick={() => {
                  const st = newSticker(k.kind, k.kind === "player" ? (music?.title ?? music?.artist ?? undefined) : undefined);
                  dispatch({ type: "sticker-add", sticker: st });
                  setSelected(st.id);
                }}
              >
                <StickerSwatch kind={k.kind} color={k.color} />
                <span>{k.label}</span>
              </button>
            ))}
          </div>
          {sticker ? (
            <div className={s.stickerPanel}>
              <p className={s.kicker}>Selected: {STICKER_KINDS.find((k) => k.kind === sticker.kind)?.label} · drag it on the Story</p>
              <div className={s.grid2}>
                <label className={s.field}>
                  <span>Size · {sticker.scale.toFixed(1)}×</span>
                  <input type="range" min={0.3} max={3} step={0.05} value={sticker.scale} onChange={(e) => dispatch({ type: "sticker", id: sticker.id, patch: { scale: Number(e.target.value) } })} />
                </label>
                <label className={s.field}>
                  <span>Rotate · {Math.round(sticker.rotate)}°</span>
                  <input type="range" min={0} max={359} step={1} value={sticker.rotate} onChange={(e) => dispatch({ type: "sticker", id: sticker.id, patch: { rotate: Number(e.target.value) } })} />
                </label>
              </div>
              <div className={s.grid2}>
                <label className={s.field}>
                  <span>Colour</span>
                  <input type="color" className={s.color} value={sticker.color} onChange={(e) => dispatch({ type: "sticker", id: sticker.id, patch: { color: e.target.value } })} />
                </label>
                {(sticker.kind === "note" || sticker.kind === "player") && (
                  <label className={s.field}>
                    <span>Words</span>
                    <input className={s.input} maxLength={28} value={sticker.text ?? ""} onChange={(e) => dispatch({ type: "sticker", id: sticker.id, patch: { text: e.target.value } })} />
                  </label>
                )}
              </div>
              <div className={s.row}>
                <button className={s.secondary} onClick={() => { dispatch({ type: "sticker-remove", id: sticker.id }); setSelected(null); }}>Remove sticker</button>
                <button className={s.linkBtn} onClick={() => setSelected(null)}>Done</button>
              </div>
            </div>
          ) : (
            (story.stickers ?? []).length > 0 && <p className={s.small}>Tap a sticker on the Story to resize, rotate, recolour or remove it.</p>
          )}
        </fieldset>

        <fieldset className={s.group}>
          <legend>{tpl.overlayLabel}</legend>
          <div className={s.grid2}>
            <label className={s.field}>
              <span>Strength · {Math.round(story.overlay.strength * 100)}%</span>
              <input type="range" min={0} max={1} step={0.01} value={story.overlay.strength} onChange={(e) => dispatch({ type: "overlay", patch: { strength: Number(e.target.value) } })} />
            </label>
            <label className={s.field}>
              <span>Colour</span>
              <input type="color" className={s.color} value={story.overlay.color} onChange={(e) => dispatch({ type: "overlay", patch: { color: e.target.value } })} />
            </label>
          </div>
        </fieldset>

        <fieldset className={s.group}>
          <legend>Details</legend>
          {tpl.decorations.map((d) => (
            <label key={d.key} className={s.check}>
              <input type="checkbox" checked={story.decorations[d.key] !== false} onChange={(e) => dispatch({ type: "decoration", key: d.key, on: e.target.checked })} />
              {d.label}
            </label>
          ))}
        </fieldset>

        <div className={s.exportRow}>
          <button className={s.primary} onClick={doExport} disabled={exporting === "busy"}>
            {exporting === "busy" ? "Rendering…" : "Download PNG"}
          </button>
          {onSave && (
            <button className={s.secondary} onClick={doSave} disabled={saving.kind === "busy" || saving.kind === "done"}>
              {saving.kind === "busy" ? "Saving…" : saving.kind === "done" ? "Saved ✓" : signedIn ? "Save to my Stories" : "Log in to save"}
            </button>
          )}
          <button className={s.secondary} onClick={() => dispatch({ type: "reset", input: input(story.templateId) })}>
            Reset to template
          </button>
        </div>
        <div aria-live="polite">
          {saving.kind === "error" && (
            <p className={s.error}>
              {saving.msg} <button className={s.linkBtn} onClick={doSave}>Try again</button>
            </p>
          )}
          {saving.kind === "done" && (
            <p className={s.small}>Saved to your account. Find it under &ldquo;Your saved Stories&rdquo; on any device; the photo copy is stored privately.</p>
          )}
        </div>
        <div aria-live="polite">
          {exporting === "error" && (
            <p className={s.error}>
              Export failed. <button className={s.linkBtn} onClick={doExport}>Try again</button>
            </p>
          )}
          {exporting === "done" && (
            <p className={s.small}>
              Saved. Post it as a Story, then add the song with Instagram&apos;s Music sticker.{" "}
              <button className={s.linkBtn} onClick={onStartOver}>Make another</button>
            </p>
          )}
        </div>
        {music && music.kind !== "none" && <MusicCard music={music} />}
      </div>
    </section>
  );
}
