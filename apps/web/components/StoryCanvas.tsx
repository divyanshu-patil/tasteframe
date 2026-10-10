"use client";

import { useEffect, useRef, useState } from "react";
import type { Photo } from "../lib/story/draw";
import { fontsReady } from "../lib/story/export";
import { coverBounds } from "../lib/story/cover";
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
  onSelectSlot?: (slot: number) => void;
  onSelectText?: (key: TextKey) => void;
  onDragSticker?: (id: string, dx: number, dy: number) => void;
  onSelectSticker?: (id: string | null) => void;
  onDragCover?: (dx: number, dy: number) => void;
  /** Drag the colour window (StoryState.spot). */
  onDragSpot?: (dx: number, dy: number) => void;
  selectedSticker?: string | null;
  /** Wheel / pinch zoom of the photo crop (positive = zoom in). */
  onZoom?: (delta: number) => void;
}

type Target =
  | { kind: "text"; key: TextKey }
  | { kind: "sticker"; id: string }
  | { kind: "cover" }
  | { kind: "spot" }
  | { kind: "photo"; slot: number; start: Crop };

const inside = (p: { x: number; y: number }, r: Rect) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

export function StoryCanvas(props: Props) {
  const { photo, state, width, label, className, selectedSticker, cover = null, masks } = props;
  const ref = useRef<HTMLCanvasElement>(null);
  const hits = useRef<HitBoxes | null>(null);
  const drag = useRef<{ target: Target; x: number; y: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<number | null>(null);
  const [dropTarget, setDropTarget] = useState<{ slot: number; rect: Rect } | null>(null);
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
      const sel = state.stickers?.find((s) => s.id === selectedSticker);
      if (sel) {
        // Editor-only selection outline (never part of the export).
        const b = stickerBounds(sel);
        ctx.save();
        ctx.setLineDash([14, 10]);
        ctx.lineWidth = 4;
        ctx.strokeStyle = "#c03f13";
        ctx.strokeRect(b.x, b.y, b.w, b.h);
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
  }, [photo, state, width, height, selectedSticker, cover, masks]);

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
    if (sp && props.onDragSpot && inside(p, { x: sp.x * STORY_W, y: sp.y * STORY_H, w: sp.w * STORY_W, h: sp.h * STORY_H })) return { kind: "spot" };
    const pad = 40;
    for (const key of ["headline", "caption"] as const) {
      const b = hits.current?.[key];
      if (b && p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad) {
        return { kind: "text", key };
      }
    }
    const rects = hits.current?.slots ?? [];
    const slot = Math.max(0, rects.findIndex((r) => inside(p, r)));
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
              if (target.kind === "text") cb.current.onSelectText?.(target.key);
              if (target.kind === "photo") cb.current.onSelectSlot?.(target.slot);
              cb.current.onSelectSticker?.(target.kind === "sticker" ? target.id : null);
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
