"use client";

import { useEffect, useRef, useState } from "react";
import type { Photo } from "../lib/story/draw";
import { fontsReady } from "../lib/story/export";
import { coverBounds } from "../lib/story/cover";
import { onAssetLoaded } from "../lib/story/elements";
import type { Selection } from "../lib/story/selection";
import { elementsReady } from "../lib/story/elements";
import { stickerBounds } from "../lib/story/stickers";
import { type HitBoxes, type Mask, renderStory } from "../lib/story/templates";
import type { Crop, Rect, StoryState, TextKey } from "../lib/story/types";
import { STORY_H, STORY_W } from "../lib/story/types";

interface Props {
  /** One photo, or 1–4 for multi-photo layouts (slot order comes from state.order). */
  photo: Photo | Photo[];
  state: StoryState;
  /** Song cover image (null → photo 1 stands in). */
  cover?: Photo | null;
  /** Person masks per photo index, for cutout layouts. */
  masks?: (Mask | null)[];
  width: number; // CSS pixels
  label: string;
  className?: string;
  /** Editor mode. Deltas are in 0..1 story units. */
  onDragText?: (key: TextKey, dx: number, dy: number) => void;
  onDragPhoto?: (dx: number, dy: number, slot: number) => void;
  /** Multi-photo: restore a slot's crop (when a drag turns into a swap) and swap two slots. */
  onSetCrop?: (slot: number, crop: Crop) => void;
  onSwapSlots?: (a: number, b: number) => void;
  onDragSticker?: (id: string, dx: number, dy: number) => void;
  /** What's selected (highlighted on the canvas) and the selection callback. */
  selection?: Selection;
  onSelect?: (sel: Selection) => void;
  onDragCover?: (dx: number, dy: number) => void;
  /** Pan a box's framing (StoryState.views): repeated slots ("slot2") and named insets. */
  onDragView?: (key: string, dx: number, dy: number) => void;
  /** Move a layout box (its edge, or anywhere inside if it holds no image). */
  onDragBox?: (key: string, dx: number, dy: number) => void;
  /** Number of photos — slots beyond it are repeats of photo 1 and pan as views. */
  photoCount?: number;
  /** Drag the colour window (StoryState.spot). */
  onDragSpot?: (dx: number, dy: number) => void;
  /** Wheel / pinch zoom of the photo crop (positive = zoom in). */
  onZoom?: (delta: number) => void;
}

type Target =
  | { kind: "text"; key: TextKey }
  | { kind: "sticker"; id: string }
  | { kind: "cover" }
  | { kind: "spot" }
  | { kind: "view"; key: string }
  | { kind: "box"; key: string }
  | { kind: "photo"; slot: number; start: Crop };

const inside = (p: { x: number; y: number }, r: Rect) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

/** Story-space box of the current selection, for the highlight. */
function selectionRect(sel: Selection, s: StoryState, hits: HitBoxes | null): Rect | null {
  if (!sel) return null;
  switch (sel.kind) {
    case "text":
      return hits?.[sel.key] ?? null;
    case "sticker": {
      const st = s.stickers?.find((x) => x.id === sel.id);
      return st ? stickerBounds(st) : null;
    }
    case "slot":
      return hits?.slots[sel.i] ?? null;
    case "view":
      return hits?.views.find((v) => v.key === sel.key)?.r ?? hits?.boxes.find((b) => b.key === sel.key)?.r ?? (sel.key.startsWith("slot") ? (hits?.slots[Number(sel.key.slice(4))] ?? null) : null);
    case "box":
      return hits?.boxes.find((b) => b.key === sel.key)?.r ?? null;
    case "spot":
      return s.spot ? { x: s.spot.x * STORY_W, y: s.spot.y * STORY_H, w: s.spot.w * STORY_W, h: s.spot.h * STORY_H } : null;
    case "cover":
      return s.cover?.show ? coverBounds(s.cover) : null;
  }
}

export function StoryCanvas(props: Props) {
  const { photo, state, width, label, className, selection = null, cover = null, masks } = props;
  const ref = useRef<HTMLCanvasElement>(null);
  const hits = useRef<HitBoxes | null>(null);
  const drag = useRef<{ target: Target; x: number; y: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<number | null>(null);
  const [dropTarget, setDropTarget] = useState<{ slot: number; rect: Rect } | null>(null);
  // Lazily loaded assets (prop photos) trigger a redraw when they arrive.
  const [assetTick, setAssetTick] = useState(0);
  useEffect(() => onAssetLoaded(() => setAssetTick((n) => n + 1)), []);
  const cb = useRef(props);
  cb.current = props;
  const height = (width * STORY_H) / STORY_W;
  const interactive = Boolean(props.onDragText || props.onDragPhoto);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let cancelled = false;
    const draw = () => {
      if (cancelled) return;
      ctx.setTransform(canvas.width / STORY_W, 0, 0, canvas.height / STORY_H, 0, 0);
      hits.current = renderStory(ctx, photo, state, { cover, masks });
      const b = selectionRect(selection, state, hits.current);
      if (b) {
        // Editor-only selection mark (never part of the export): dashed ember box + corner ticks.
        ctx.save();
        ctx.setLineDash([14, 10]);
        ctx.lineWidth = 4;
        ctx.strokeStyle = "#c03f13";
        ctx.strokeRect(b.x, b.y, b.w, b.h);
        ctx.setLineDash([]);
        ctx.lineWidth = 8;
        const t = Math.min(48, b.w / 3, b.h / 3);
        for (const [x, y, dx, dy] of [[b.x, b.y, 1, 1], [b.x + b.w, b.y, -1, 1], [b.x, b.y + b.h, 1, -1], [b.x + b.w, b.y + b.h, -1, -1]] as const) {
          ctx.beginPath();
          ctx.moveTo(x + dx * t, y);
          ctx.lineTo(x, y);
          ctx.lineTo(x, y + dy * t);
          ctx.stroke();
        }
        ctx.restore();
      }
    };
    const raf = requestAnimationFrame(draw);
    // Canvas text doesn't trigger web-font loads; request story fonts explicitly, then redraw.
    void Promise.all([fontsReady(), elementsReady()]).then(() => requestAnimationFrame(draw));
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [photo, state, width, height, selection, cover, masks, assetTick]);

  // Wheel zoom needs a non-passive listener to stop the page from scrolling.
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !props.onZoom) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      cb.current.onZoom?.(-e.deltaY * 0.0015);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [props.onZoom]);

  const toStory = (e: React.PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * STORY_W, y: ((e.clientY - r.top) / r.height) * STORY_H };
  };

  const hitTest = (p: { x: number; y: number }): Target => {
    const stickers = state.stickers ?? [];
    for (let i = stickers.length - 1; i >= 0; i--) {
      const s = stickers[i]!;
      const b = stickerBounds(s);
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return { kind: "sticker", id: s.id };
    }
    if (state.cover?.show && props.onDragCover && inside(p, coverBounds(state.cover))) return { kind: "cover" };
    const sp = state.spot;
    // Generous grab area: torn strips draw their paper edges outside the window itself.
    if (sp && props.onDragSpot && inside(p, { x: sp.x * STORY_W - 30, y: sp.y * STORY_H - 60, w: sp.w * STORY_W + 60, h: sp.h * STORY_H + 120 })) return { kind: "spot" };
    const pad = 40;
    for (const key of ["headline", "caption"] as const) {
      const b = hits.current?.[key];
      if (b && p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad) {
        return { kind: "text", key };
      }
    }
    // Layout boxes: grab the frame (or anywhere, if it holds no picture) to move it; inside a
    // picture box, drag pans the picture.
    if (props.onDragBox) {
      const EDGE = 36;
      const lb = [...(hits.current?.boxes ?? [])].sort((a, b) => a.r.w * a.r.h - b.r.w * b.r.h);
      for (const b of lb) {
        const outer = { x: b.r.x - EDGE / 2, y: b.r.y - EDGE * 1.5, w: b.r.w + EDGE, h: b.r.h + EDGE * 2 };
        if (!inside(p, outer)) continue;
        const nearEdge = p.x < b.r.x + EDGE || p.x > b.r.x + b.r.w - EDGE || p.y < b.r.y + EDGE || p.y > b.r.y + b.r.h - EDGE;
        return b.image && !nearEdge ? { kind: "view", key: b.key } : { kind: "box", key: b.key };
      }
    }
    // Boxes: the smallest one under the pointer wins (insets sit on top of big photos).
    const area = (r: Rect) => r.w * r.h;
    const boxes: ({ r: Rect } & ({ slot: number } | { key: string }))[] = [
      ...(hits.current?.slots ?? []).map((r, slot) => ({ r, slot })),
      ...(props.onDragView ? (hits.current?.views ?? []).map((v) => ({ r: v.r, key: v.key })) : []),
    ].filter((b) => inside(p, b.r));
    boxes.sort((a, b) => area(a.r) - area(b.r));
    const hit = boxes[0];
    if (hit && "key" in hit) return { kind: "view", key: hit.key };
    const slot = hit && "slot" in hit ? hit.slot : 0;
    if (slot > 0 && slot >= (props.photoCount ?? 1) && props.onDragView) return { kind: "view", key: `slot${slot}` };
    const start = slot === 0 ? state.crop : (state.crops?.[slot - 1] ?? state.crop);
    return { kind: "photo", slot, start };
  };

  const slotAt = (p: { x: number; y: number }) => (hits.current?.slots ?? []).findIndex((r) => inside(p, r));

  const canvasEl = (
    <canvas
      ref={ref}
      className={className}
      style={{ width, height, touchAction: interactive ? "none" : undefined }}
      role="img"
      aria-label={label}
      onPointerDown={
        interactive
          ? (e) => {
              const p = toStory(e);
              pointers.current.set(e.pointerId, p);
              e.currentTarget.setPointerCapture(e.pointerId);
              if (pointers.current.size === 2) {
                const [a, b] = [...pointers.current.values()] as [typeof p, typeof p];
                pinch.current = Math.hypot(a.x - b.x, a.y - b.y);
                drag.current = null;
                return;
              }
              const target = hitTest(p);
              cb.current.onSelect?.(
                target.kind === "photo" ? { kind: "slot", i: target.slot }
                : target.kind === "text" ? { kind: "text", key: target.key }
                : target.kind === "sticker" ? { kind: "sticker", id: target.id }
                : target.kind === "view" ? { kind: "view", key: target.key }
                : target.kind === "box" ? { kind: "box", key: target.key }
                : { kind: target.kind },
              );
              drag.current = { target, x: p.x, y: p.y };
            }
          : undefined
      }
      onPointerMove={
        interactive
          ? (e) => {
              const p = toStory(e);
              if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, p);
              if (pinch.current !== null && pointers.current.size === 2) {
                const [a, b] = [...pointers.current.values()] as [typeof p, typeof p];
                const dist = Math.hypot(a.x - b.x, a.y - b.y);
                cb.current.onZoom?.((dist - pinch.current) / 400);
                pinch.current = dist;
                return;
              }
              const d = drag.current;
              if (!d) return;
              const dx = (p.x - d.x) / STORY_W;
              const dy = (p.y - d.y) / STORY_H;
              drag.current = { ...d, x: p.x, y: p.y };
              if (d.target.kind === "photo") {
                // Over a different photo slot → this drag becomes a swap: restore the source crop
                // and highlight the drop target. Otherwise it reframes the photo.
                const over = cb.current.onSwapSlots ? slotAt(p) : -1;
                if (over >= 0 && over !== d.target.slot) {
                  if (!dropTarget) cb.current.onSetCrop?.(d.target.slot, d.target.start);
                  const rect = hits.current?.slots[over];
                  if (rect && dropTarget?.slot !== over) setDropTarget({ slot: over, rect });
                } else {
                  if (dropTarget) setDropTarget(null);
                  cb.current.onDragPhoto?.(dx, dy, d.target.slot);
                }
              }
              else if (d.target.kind === "text") cb.current.onDragText?.(d.target.key, dx, dy);
              else if (d.target.kind === "cover") cb.current.onDragCover?.(dx, dy);
              else if (d.target.kind === "spot") cb.current.onDragSpot?.(dx, dy);
              else if (d.target.kind === "view") cb.current.onDragView?.(d.target.key, dx, dy);
              else if (d.target.kind === "box") cb.current.onDragBox?.(d.target.key, dx, dy);
              else cb.current.onDragSticker?.(d.target.id, dx, dy);
            }
          : undefined
      }
      onPointerUp={
        interactive
          ? (e) => {
              pointers.current.delete(e.pointerId);
              if (pointers.current.size < 2) pinch.current = null;
              const d = drag.current;
              if (d?.target.kind === "photo" && dropTarget) cb.current.onSwapSlots?.(d.target.slot, dropTarget.slot);
              setDropTarget(null);
              drag.current = null;
            }
          : undefined
      }
      onPointerCancel={
        interactive
          ? (e) => {
              pointers.current.delete(e.pointerId);
              pinch.current = null;
              setDropTarget(null);
              drag.current = null;
            }
          : undefined
      }
    />
  );
  if (!interactive) return canvasEl;
  return (
    <div style={{ position: "relative", width, height, lineHeight: 0 }}>
      {canvasEl}
      {dropTarget && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: `${(dropTarget.rect.x / STORY_W) * 100}%`,
            top: `${(dropTarget.rect.y / STORY_H) * 100}%`,
            width: `${(dropTarget.rect.w / STORY_W) * 100}%`,
            height: `${(dropTarget.rect.h / STORY_H) * 100}%`,
            outline: "3px dashed #c03f13",
            background: "rgba(192,63,19,0.15)",
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
}
