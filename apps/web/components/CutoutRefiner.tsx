"use client";

// Touch up the automatic (MediaPipe) cutout.
// Smart (default): scribble over a part or circle it; SlimSAM (13 MB, on-device, in a worker)
//   turns the rough strokes into an object selection, snapped to the photo's edges and previewed
//   in green / red with an outline. Without the model, smartSelect's colour-based growing stands
//   in. Finish merges the selection into the cutout and applies.
// Brush: paint the mask directly for pixel-level fixes.
// Works from a blank mask too, so you can select a subject the person model didn't find.
import { useEffect, useRef, useState } from "react";
import type { Photo } from "../lib/story/draw";
import { maskCanvas } from "../lib/story/segment";
import { prepareSelect, selectAt } from "../lib/story/ml";
import { type Guide, type Pixels, smartSelect, snapEdges } from "../lib/story/smartselect";
import { ModelProgress } from "./ModelProgress";
import type { Mask } from "../lib/story/templates";
import { Segmented, Slider, px } from "./controls";
import s from "./maker.module.css";

type Mode = "smart" | "brush";
type Tool = "add" | "erase";
type Pt = { x: number; y: number }; // view px
interface Rough { tool: Tool; loop: boolean; pts: Pt[] }
type Ai = "ready" | "busy";
const SELECT_SIDE = 320; // smart select works at this size; the guided filter keeps edges soft

const MAX_UNDO = 20; // full-mask snapshots, ≤640px each
const ADD = { fill: "rgba(60, 220, 130, 0.45)", line: "#ffffff", ink: "rgba(60, 220, 130, 0.95)" };
const REMOVE = { fill: "rgba(255, 64, 48, 0.5)", line: "#ff5c35", ink: "rgba(255, 80, 60, 0.95)" };

function copyOf(photo: Photo, mask: Mask | null): HTMLCanvasElement {
  const c = maskCanvas(photo);
  if (mask) c.getContext("2d")?.drawImage(mask, 0, 0, c.width, c.height);
  return c;
}
function blank(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** A stroke whose ends meet around a real area is a lasso ("everything inside this"). */
export function isLoop(pts: Pt[]): boolean {
  if (pts.length < 8) return false;
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1]!, pts[i]!);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  return dist(pts[0]!, pts[pts.length - 1]!) < Math.max(28, len * 0.12) && Math.min(w, h) > 24;
}

/** `n` evenly spaced points along a stroke. */
const spaced = (pts: Pt[], n: number) => (pts.length <= n ? pts : Array.from({ length: n }, (_, i) => pts[Math.round((i * (pts.length - 1)) / (n - 1))]!));
const centroid = (pts: Pt[]) => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });
/** For a loop: its centre and points halfway to the edge ("this")… */
const inside = (pts: Pt[]) => {
  const c = centroid(pts);
  return [c, ...spaced(pts, 5).slice(0, 4).map((p) => ({ x: (c.x + p.x) / 2, y: (c.y + p.y) / 2 }))];
};
/** …and points just outside it ("not this"). */
const outside = (pts: Pt[]) => {
  const c = centroid(pts);
  return spaced(pts, 7).slice(0, 6).map((p) => ({ x: c.x + (p.x - c.x) * 1.25, y: c.y + (p.y - c.y) * 1.25 }));
};

/** ≤64 evenly spaced points: plenty for the model, cheap to send. */
const thin = (pts: Pt[]) => (pts.length <= 64 ? pts : Array.from({ length: 64 }, (_, i) => pts[Math.round((i * (pts.length - 1)) / 63)]!));

interface Props {
  photo: Photo;
  /** Mask to start from (an earlier refinement or the automatic one); null starts blank. */
  start: Mask | null;
  /** The automatic cutout, for "Reset". */
  auto: Mask | null;
  title: string;
  onApply: (mask: HTMLCanvasElement) => void;
  onClose: () => void;
}

export function CutoutRefiner({ photo, start, auto, title, onApply, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const view = useRef<HTMLCanvasElement>(null);
  const work = useRef<HTMLCanvasElement | null>(null);
  const layer = useRef<HTMLCanvasElement | null>(null);
  const overlay = useRef<HTMLCanvasElement | null>(null);
  const undo = useRef<ImageData[]>([]);
  const last = useRef<Pt | null>(null);
  const cursor = useRef<Pt | null>(null);
  const frame = useRef(0);
  // Smart mode: strokes waiting for Finish, the one being drawn, and the model's selections.
  const rough = useRef<Rough[]>([]);
  const drawing = useRef<Rough | null>(null);
  const sel = useRef<{ add: HTMLCanvasElement | null; remove: HTMLCanvasElement | null }>({ add: null, remove: null });
  const run = useRef(0);
  const running = useRef<Promise<void>>(Promise.resolve());
  const pixels = useRef<Pixels | null>(null);
  const samReady = useRef<Promise<boolean>>(Promise.resolve(false));
  const [mode, setMode] = useState<Mode>("smart");
  const [tool, setTool] = useState<Tool>("add");
  const [size, setSize] = useState(36);
  const [undoCount, setUndoCount] = useState(0);
  const [pending, setPending] = useState(0);
  const [ai, setAi] = useState<Ai>("ready");
  const [box] = useState(() => {
    const k = Math.min(Math.min(584, window.innerWidth - 88) / photo.width, (window.innerHeight * 0.52) / photo.height);
    return { w: Math.round(photo.width * k), h: Math.round(photo.height * k), dpr: Math.min(2, window.devicePixelRatio || 1) };
  });

  const draw = () => {
    const c = view.current;
    const m = work.current;
    const g = c?.getContext("2d");
    if (!c || !m || !g) return;
    const { width: W, height: H } = c;
    // Outside the cutout: dark and grey. Inside: the photo in colour with a light warm tint.
    g.save();
    g.filter = "grayscale(1) brightness(0.4)";
    g.drawImage(photo, 0, 0, W, H);
    g.restore();
    const l = (layer.current ??= document.createElement("canvas"));
    l.width = W;
    l.height = H;
    const lg = l.getContext("2d");
    if (lg) {
      lg.drawImage(photo, 0, 0, W, H);
      lg.globalCompositeOperation = "destination-in";
      lg.drawImage(m, 0, 0, W, H);
      lg.globalCompositeOperation = "source-atop";
      lg.fillStyle = "rgba(255, 92, 53, 0.2)";
      lg.fillRect(0, 0, W, H);
      g.drawImage(l, 0, 0);
    }
    if (overlay.current) g.drawImage(overlay.current, 0, 0);
    // The rough strokes stay visible (thin) so you can see what you asked for.
    g.save();
    g.lineCap = g.lineJoin = "round";
    for (const r of drawing.current ? [...rough.current, drawing.current] : rough.current) {
      const ink = r.tool === "add" ? ADD.ink : REMOVE.ink;
      g.beginPath();
      r.pts.forEach((p, i) => (i ? g.lineTo(p.x * box.dpr, p.y * box.dpr) : g.moveTo(p.x * box.dpr, p.y * box.dpr)));
      if (r.loop) {
        g.closePath();
        g.fillStyle = ink.replace("0.95", "0.12");
        g.fill();
      }
      g.setLineDash(r === drawing.current ? [] : [6 * box.dpr, 5 * box.dpr]);
      g.lineWidth = 3 * box.dpr;
      g.strokeStyle = ink;
      if (r.pts.length === 1) {
        g.arc(r.pts[0]!.x * box.dpr, r.pts[0]!.y * box.dpr, 5 * box.dpr, 0, Math.PI * 2);
        g.fillStyle = ink;
        g.fill();
      } else g.stroke();
    }
    g.restore();
    const p = cursor.current;
    if (p) {
      const r = (mode === "brush" ? size / 2 : 7) * box.dpr;
      g.lineWidth = 3 * box.dpr;
      g.strokeStyle = "rgba(0,0,0,0.6)";
      g.beginPath();
      g.arc(p.x * box.dpr, p.y * box.dpr, r, 0, Math.PI * 2);
      g.stroke();
      g.lineWidth = 1.5 * box.dpr;
      g.strokeStyle = tool === "add" ? "#fff" : "#ff5c35";
      g.stroke();
    }
  };
  const redraw = () => {
    if (!frame.current) frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      draw();
    });
  };

  /** Tinted, outlined preview of the model's selections at view size. */
  const buildOverlay = () => {
    const c = view.current;
    const m = work.current;
    const { add, remove } = sel.current;
    if (!c || !m || (!add && !remove)) return void (overlay.current = null);
    const { width: W, height: H } = c;
    const o = (overlay.current = blank(W, H));
    const og = o.getContext("2d");
    const paint = (mask: HTMLCanvasElement, only: HTMLCanvasElement | null, look: typeof ADD) => {
      const t = blank(W, H);
      const tg = t.getContext("2d");
      if (!tg || !og) return;
      tg.drawImage(mask, 0, 0, W, H);
      if (only) {
        tg.globalCompositeOperation = "destination-in"; // removal only matters where the cutout is
        tg.drawImage(only, 0, 0, W, H);
      }
      const shape = blank(W, H);
      shape.getContext("2d")?.drawImage(t, 0, 0);
      const edge = blank(W, H);
      const eg = edge.getContext("2d");
      if (eg) {
        const d = 2 * box.dpr;
        for (let i = 0; i < 8; i++) eg.drawImage(shape, Math.cos((i * Math.PI) / 4) * d, Math.sin((i * Math.PI) / 4) * d);
        eg.globalCompositeOperation = "source-in";
        eg.fillStyle = look.line;
        eg.fillRect(0, 0, W, H);
        eg.globalCompositeOperation = "destination-out";
        eg.drawImage(shape, 0, 0);
      }
      tg.globalCompositeOperation = "source-in";
      tg.fillStyle = look.fill;
      tg.fillRect(0, 0, W, H);
      og.drawImage(t, 0, 0);
      og.drawImage(edge, 0, 0);
    };
    if (add) paint(add, null, ADD);
    if (remove) paint(remove, m, REMOVE);
  };

  /** Turn the rough strokes into selections: one to add, one to remove. */
  const toAlphaCanvas = (a: Float32Array, w: number, h: number) => {
    const c = blank(w, h);
    const g = c.getContext("2d");
    if (!g) return null;
    const img = g.createImageData(w, h);
    // Solid selection: everything clearly in is fully in, with only a 1–2 px anti-aliased edge
    // (the edge-snapping filter alone leaves a wide, cloudy fade).
    for (let k = 0; k < a.length; k++) img.data[k * 4 + 3] = Math.round(Math.max(0, Math.min(1, (a[k]! - 0.5) * 6 + 0.5)) * 255);
    g.putImageData(img, 0, 0);
    return c;
  };

  /** SlimSAM: each stroke of tool `t` is one "this"; strokes of the other tool say "not this". */
  const samPick = async (t: Tool, list: Rough[], px: Pixels): Promise<HTMLCanvasElement | null> => {
    const norm = (p: Pt) => ({ x: Math.min(1, Math.max(0, p.x / box.w)), y: Math.min(1, Math.max(0, p.y / box.h)) });
    const not = list.filter((r) => r.tool !== t).flatMap((r) => spaced(r.pts, 4)).map((p) => ({ ...norm(p), label: 0 as const }));
    const acc = blank(px.width, px.height);
    const g = acc.getContext("2d");
    let any = false;
    for (const r of list.filter((x) => x.tool === t)) {
      const prompt = r.loop
        ? [...inside(r.pts).map((p) => ({ ...norm(p), label: 1 as const })), ...outside(r.pts).map((p) => ({ ...norm(p), label: 0 as const }))]
        : spaced(r.pts, 6).map((p) => ({ ...norm(p), label: 1 as const }));
      const m = await selectAt(photo, [...prompt, ...not]);
      if (m && g) {
        g.drawImage(m, 0, 0, acc.width, acc.height); // white + alpha: drawing again = union
        any = true;
      }
    }
    if (!any || !g) return null;
    const data = g.getImageData(0, 0, acc.width, acc.height).data;
    const a = new Float32Array(acc.width * acc.height);
    for (let k = 0; k < a.length; k++) a[k] = data[k * 4 + 3]! / 255;
    return toAlphaCanvas(snapEdges(px, a), px.width, px.height);
  };

  /** Turn the rough strokes into selections: one to add, one to remove. */
  const think = () => {
    const id = ++run.current;
    const list = rough.current.slice();
    setAi("busy");
    running.current = (async () => {
      await new Promise((r) => setTimeout(r, 16)); // let "Finding the edges…" paint first
      const sam = await samReady.current; // waits for the first download, if still running
      const px = pixels.current;
      if (id !== run.current || !px) return;
      const has = (t: Tool) => list.some((r) => r.tool === t);
      let add: HTMLCanvasElement | null = null, remove: HTMLCanvasElement | null = null;
      if (sam) {
        add = has("add") ? await samPick("add", list, px) : null;
        remove = has("erase") ? await samPick("erase", list, px) : null;
      }
      if (!sam || (has("add") && !add) || (has("erase") && !remove)) {
        // Fallback without the model: colour-based selection, on this device.
        const guides: Guide[] = list.map((r) => ({ tool: r.tool, loop: r.loop, pts: thin(r.pts).map((p) => ({ x: p.x / box.w, y: p.y / box.h })) }));
        if (has("add") && !add) add = toAlphaCanvas(smartSelect(px, guides, "add"), px.width, px.height);
        if (has("erase") && !remove) remove = toAlphaCanvas(smartSelect(px, guides, "erase"), px.width, px.height);
      }
      if (id !== run.current) return;
      sel.current = { add, remove };
      buildOverlay();
      setAi("ready");
      redraw();
    })();
  };

  const clearRough = () => {
    run.current++;
    rough.current = [];
    sel.current = { add: null, remove: null };
    overlay.current = null;
    setPending(0);
  };

  useEffect(() => {
    work.current = copyOf(photo, start);
    dialog.current?.showModal();
    draw();
    samReady.current = prepareSelect(photo); // SlimSAM: download once, then read this photo
    const k = Math.min(1, SELECT_SIDE / Math.max(photo.width, photo.height));
    const pc = blank(Math.max(1, Math.round(photo.width * k)), Math.max(1, Math.round(photo.height * k)));
    const pg = pc.getContext("2d", { willReadFrequently: true });
    if (pg) {
      pg.drawImage(photo, 0, 0, pc.width, pc.height);
      pixels.current = pg.getImageData(0, 0, pc.width, pc.height);
    }
    return () => {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- set up once per opening
  }, []);
  // The brush ring shows the current tool and size.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(redraw, [tool, size, mode]);

  const snapshot = () => {
    const m = work.current;
    const g = m?.getContext("2d");
    if (!m || !g) return;
    undo.current.push(g.getImageData(0, 0, m.width, m.height));
    if (undo.current.length > MAX_UNDO) undo.current.shift();
    setUndoCount(undo.current.length);
  };
  const stroke = (a: Pt, b: Pt, t: Tool = tool, width = size) => {
    const m = work.current;
    const g = m?.getContext("2d");
    if (!m || !g) return;
    const k = m.width / box.w;
    g.save();
    g.globalCompositeOperation = t === "add" ? "source-over" : "destination-out";
    g.strokeStyle = g.fillStyle = "#000";
    g.lineWidth = width * k;
    g.lineCap = g.lineJoin = "round";
    g.beginPath();
    g.moveTo(a.x * k, a.y * k);
    g.lineTo(b.x * k, b.y * k);
    g.stroke();
    g.beginPath();
    g.arc(b.x * k, b.y * k, (width * k) / 2, 0, Math.PI * 2);
    g.fill();
    g.restore();
  };

  /** Merge the smart selections into the cutout. */
  const bake = () => {
    const m = work.current;
    const g = m?.getContext("2d");
    const { add, remove } = sel.current;
    if (!m || !g || !rough.current.length || (!add && !remove)) return clearRough();
    snapshot();
    if (add) g.drawImage(add, 0, 0, m.width, m.height);
    if (remove) {
      g.save();
      g.globalCompositeOperation = "destination-out";
      g.drawImage(remove, 0, 0, m.width, m.height);
      g.restore();
    }
    clearRough();
    redraw();
  };

  const at = (e: React.PointerEvent<HTMLCanvasElement>): Pt => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * box.w, y: ((e.clientY - r.top) / r.height) * box.h };
  };
  const replace = (fill: Mask | null) => {
    const m = work.current;
    const g = m?.getContext("2d");
    if (!m || !g) return;
    clearRough();
    snapshot();
    g.clearRect(0, 0, m.width, m.height);
    if (fill) g.drawImage(fill, 0, 0, m.width, m.height);
    redraw();
  };
  const stepBack = () => {
    if (rough.current.length) {
      rough.current.pop();
      setPending(rough.current.length);
      if (rough.current.length) think();
      else clearRough();
      return redraw();
    }
    const snap = undo.current.pop();
    if (snap) work.current?.getContext("2d")?.putImageData(snap, 0, 0);
    setUndoCount(undo.current.length);
    redraw();
  };
  const finish = async () => {
    await running.current;
    bake();
    if (work.current) onApply(work.current);
  };

  const status =
    mode === "brush"
      ? null
      : ai === "busy"
        ? "Finding the edges…"
        : pending
          ? "Green will be added and red removed. Keep drawing to adjust, or press Finish."
          : "Scribble over a part or circle it. Add brings it into the cutout, Remove takes it out.";

  return (
    <dialog
      ref={dialog}
      className={`${s.dialog} ${s.refiner}`}
      aria-labelledby="refine-title"
      onClose={onClose}
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
          e.preventDefault();
          stepBack();
        } else if (e.key === "[" || e.key === "]") setSize((v) => Math.max(4, Math.min(120, v + (e.key === "]" ? 6 : -6))));
      }}
    >
      <div className={s.dialogBody}>
        <p className={s.kicker}>Cutout</p>
        <h2 id="refine-title" className={s.refinerTitle}>{title}</h2>
        <div className={s.refinerTools}>
          <Segmented<Mode> label="Refine mode" value={mode} options={[{ id: "smart", label: "Smart select" }, { id: "brush", label: "Brush" }]} onChange={(m) => {
            if (m === "brush") bake(); // keep what the AI found before painting by hand
            setMode(m);
          }} />
          <Segmented<Tool> label="Add or remove" value={tool} options={[{ id: "add", label: "Add" }, { id: "erase", label: "Remove" }]} onChange={setTool} />
        </div>
        <canvas
          ref={view}
          className={s.refinerCanvas}
          width={Math.round(box.w * box.dpr)}
          height={Math.round(box.h * box.dpr)}
          style={{ width: box.w, height: box.h }}
          aria-label="Your photo with the cutout in colour. Draw on it to refine."
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            const p = at(e);
            cursor.current = p;
            if (mode === "smart") drawing.current = { tool, loop: false, pts: [p] };
            else {
              snapshot();
              stroke(p, p);
              last.current = p;
            }
            redraw();
          }}
          onPointerMove={(e) => {
            const p = at(e);
            cursor.current = p;
            if (drawing.current) {
              const prev = drawing.current.pts[drawing.current.pts.length - 1]!;
              if (dist(prev, p) > 2) drawing.current.pts.push(p);
            } else if (last.current) {
              stroke(last.current, p);
              last.current = p;
            }
            redraw();
          }}
          onPointerUp={() => {
            last.current = null;
            const r = drawing.current;
            drawing.current = null;
            if (!r) return;
            r.loop = isLoop(r.pts);
            rough.current.push(r);
            setPending(rough.current.length);
            think();
            redraw();
          }}
          onPointerCancel={() => {
            last.current = null;
            drawing.current = null;
            redraw();
          }}
          onPointerLeave={() => {
            cursor.current = null;
            redraw();
          }}
        />
        {mode === "smart" && <ModelProgress task="refine" label="Loading smart select" working="Reading your photo for smart select…" />}
        {status && <p className={s.small} role="status" aria-live="polite">{status}</p>}
        {mode === "brush" && (
          <>
            <p className={s.small}>Paint to fix edges by hand. <kbd>[</kbd> <kbd>]</kbd> brush size · <kbd>⌘/Ctrl Z</kbd> undo.</p>
            <Slider label="Brush size" value={size} min={4} max={120} step={1} nudge={4} format={px} onChange={setSize} />
          </>
        )}
        <div className={s.row}>
          <button type="button" className={s.secondary} disabled={undoCount === 0 && pending === 0} onClick={stepBack}>Undo</button>
          <button type="button" className={s.linkBtn} disabled={!auto} onClick={() => replace(auto)}>Reset to automatic</button>
          <button type="button" className={s.linkBtn} onClick={() => replace(null)}>Clear all</button>
        </div>
        <div className={s.row}>
          <button type="button" className={s.primary} disabled={ai === "busy"} onClick={() => void finish()}>Finish</button>
          <button type="button" className={s.secondary} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </dialog>
  );
}
