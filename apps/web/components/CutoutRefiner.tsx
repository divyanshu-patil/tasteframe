"use client";

// Touch up the automatic (MediaPipe) cutout by painting on its mask: Add brings parts of the
// photo into the cutout, Erase removes them. Works from a blank mask too, so you can draw a
// subject the model didn't find (a pet, a drink, a second person).
import { useEffect, useRef, useState } from "react";
import type { Photo } from "../lib/story/draw";
import { maskCanvas } from "../lib/story/segment";
import type { Mask } from "../lib/story/templates";
import { Segmented, Slider, px } from "./controls";
import s from "./maker.module.css";

type Tool = "add" | "erase";
type Pt = { x: number; y: number };
const MAX_UNDO = 20; // full-mask snapshots, ≤640px each

function copyOf(photo: Photo, mask: Mask | null): HTMLCanvasElement {
  const c = maskCanvas(photo);
  if (mask) c.getContext("2d")?.drawImage(mask, 0, 0, c.width, c.height);
  return c;
}

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
  const undo = useRef<ImageData[]>([]);
  const last = useRef<Pt | null>(null);
  const cursor = useRef<Pt | null>(null);
  const frame = useRef(0);
  const [tool, setTool] = useState<Tool>("add");
  const [size, setSize] = useState(36);
  const [undoCount, setUndoCount] = useState(0);
  const [box] = useState(() => {
    const k = Math.min(Math.min(584, window.innerWidth - 88) / photo.width, (window.innerHeight * 0.56) / photo.height);
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
    const p = cursor.current;
    if (p) {
      const r = (size / 2) * box.dpr;
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

  useEffect(() => {
    work.current = copyOf(photo, start);
    dialog.current?.showModal();
    draw();
    return () => {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- set up once per opening
  }, []);
  // The brush ring shows the current tool and size.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(redraw, [tool, size]);

  const snapshot = () => {
    const m = work.current;
    const g = m?.getContext("2d");
    if (!m || !g) return;
    undo.current.push(g.getImageData(0, 0, m.width, m.height));
    if (undo.current.length > MAX_UNDO) undo.current.shift();
    setUndoCount(undo.current.length);
  };
  const stroke = (a: Pt, b: Pt) => {
    const m = work.current;
    const g = m?.getContext("2d");
    if (!m || !g) return;
    const k = m.width / box.w;
    g.save();
    g.globalCompositeOperation = tool === "add" ? "source-over" : "destination-out";
    g.strokeStyle = g.fillStyle = "#000";
    g.lineWidth = size * k;
    g.lineCap = g.lineJoin = "round";
    g.beginPath();
    g.moveTo(a.x * k, a.y * k);
    g.lineTo(b.x * k, b.y * k);
    g.stroke();
    g.beginPath();
    g.arc(b.x * k, b.y * k, (size * k) / 2, 0, Math.PI * 2);
    g.fill();
    g.restore();
  };
  const at = (e: React.PointerEvent<HTMLCanvasElement>): Pt => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * box.w, y: ((e.clientY - r.top) / r.height) * box.h };
  };
  const replace = (fill: Mask | null) => {
    const m = work.current;
    const g = m?.getContext("2d");
    if (!m || !g) return;
    snapshot();
    g.clearRect(0, 0, m.width, m.height);
    if (fill) g.drawImage(fill, 0, 0, m.width, m.height);
    redraw();
  };
  const stepBack = () => {
    const snap = undo.current.pop();
    if (snap) work.current?.getContext("2d")?.putImageData(snap, 0, 0);
    setUndoCount(undo.current.length);
    redraw();
  };

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
        <p className={s.small}>
          Coloured parts are in the cutout. Paint with <strong>Add</strong> to bring in anything it missed, or{" "}
          <strong>Erase</strong> to take out background it caught. <kbd>[</kbd> <kbd>]</kbd> brush size · <kbd>⌘/Ctrl Z</kbd> undo.
        </p>
        <canvas
          ref={view}
          className={s.refinerCanvas}
          width={Math.round(box.w * box.dpr)}
          height={Math.round(box.h * box.dpr)}
          style={{ width: box.w, height: box.h }}
          aria-label="Your photo with the cutout highlighted. Drag to paint."
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            snapshot();
            const p = at(e);
            stroke(p, p);
            last.current = cursor.current = p;
            redraw();
          }}
          onPointerMove={(e) => {
            const p = at(e);
            if (last.current) stroke(last.current, p);
            if (last.current) last.current = p;
            cursor.current = p;
            redraw();
          }}
          onPointerUp={() => (last.current = null)}
          onPointerCancel={() => (last.current = null)}
          onPointerLeave={() => {
            cursor.current = null;
            redraw();
          }}
        />
        <div className={s.refinerTools}>
          <Segmented label="Brush" value={tool} options={[{ id: "add", label: "Add" }, { id: "erase", label: "Erase" }]} onChange={setTool} />
          <Slider label="Brush size" value={size} min={4} max={120} step={1} nudge={4} format={px} onChange={setSize} />
        </div>
        <div className={s.row}>
          <button type="button" className={s.secondary} disabled={undoCount === 0} onClick={stepBack}>Undo</button>
          <button type="button" className={s.linkBtn} disabled={!auto} onClick={() => replace(auto)}>Reset to automatic</button>
          <button type="button" className={s.linkBtn} onClick={() => replace(null)}>Clear all</button>
        </div>
        <div className={s.row}>
          <button type="button" className={s.primary} onClick={() => work.current && onApply(work.current)}>Apply</button>
          <button type="button" className={s.secondary} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </dialog>
  );
}
