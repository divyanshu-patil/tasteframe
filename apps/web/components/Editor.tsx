"use client";

import { useEffect, useState } from "react";
import type { Music } from "../lib/api";
import type { Photo } from "../lib/story/draw";
import { type EditorAction, editorReducer } from "../lib/story/editor";
import { exportFilename, exportPng } from "../lib/story/export";
import { TEMPLATES } from "../lib/story/templates";
import type { Align, FontRole, StoryState, TemplateId, TemplateInput, TextKey } from "../lib/story/types";
import { TEMPLATE_IDS } from "../lib/story/types";
import { MusicCard } from "./Results";
import { StoryCanvas } from "./StoryCanvas";
import s from "./maker.module.css";

interface Props {
  photo: Photo;
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

export function Editor({ photo, story, setStory, input, suggested, music, onBack, onStartOver, onSave, signedIn = false }: Props) {
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

  const doExport = async () => {
    setExporting("busy");
    try {
      const blob = await exportPng(photo, story);
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
          photo={photo}
          state={story}
          width={width}
          label={`Editable ${tpl.name} Story. Drag text to move it, drag elsewhere to reposition the photo.`}
          onSelectText={setActive}
          onDragText={(key, dx, dy) => dispatch({ type: "move", key, x: story[key].x + dx, y: story[key].y + dy })}
          onDragPhoto={(dx, dy) =>
            dispatch({ type: "crop", patch: { x: story.crop.x - dx * 1.5, y: story.crop.y - dy * 1.5 } })
          }
        />
        <p className={s.small}>Drag text to move it · drag the photo to reframe · exports at 1080 × 1920</p>
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
          <legend>Photo</legend>
          <label className={s.field}>
            <span>Zoom · {story.crop.zoom.toFixed(2)}×</span>
            <input type="range" min={1} max={3} step={0.01} value={story.crop.zoom} onChange={(e) => dispatch({ type: "crop", patch: { zoom: Number(e.target.value) } })} />
          </label>
          <div className={s.grid2}>
            <label className={s.field}>
              <span>Focus left ↔ right</span>
              <input type="range" min={0} max={1} step={0.01} value={story.crop.x} onChange={(e) => dispatch({ type: "crop", patch: { x: Number(e.target.value) } })} />
            </label>
            <label className={s.field}>
              <span>Focus top ↕ bottom</span>
              <input type="range" min={0} max={1} step={0.01} value={story.crop.y} onChange={(e) => dispatch({ type: "crop", patch: { y: Number(e.target.value) } })} />
            </label>
          </div>
          <button className={s.linkBtn} onClick={() => dispatch({ type: "crop", patch: { zoom: 1, x: 0.5, y: 0.5 } })}>Reset crop</button>
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
