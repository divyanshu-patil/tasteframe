"use client";

import { useEffect, useRef } from "react";
import type { Photo } from "../lib/story/draw";
import { type HitBoxes, renderStory } from "../lib/story/templates";
import type { StoryState, TextKey } from "../lib/story/types";
import { STORY_H, STORY_W } from "../lib/story/types";

interface Props {
  photo: Photo;
  state: StoryState;
  width: number; // CSS pixels
  label: string;
  className?: string;
  /** Editor mode: drag text layers or pan the photo. Deltas are in 0..1 story units. */
  onDragText?: (key: TextKey, dx: number, dy: number) => void;
  onDragPhoto?: (dx: number, dy: number) => void;
  onSelectText?: (key: TextKey) => void;
}

export function StoryCanvas({ photo, state, width, label, className, onDragText, onDragPhoto, onSelectText }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const hits = useRef<HitBoxes | null>(null);
  const drag = useRef<{ target: TextKey | "photo"; x: number; y: number } | null>(null);
  const height = (width * STORY_H) / STORY_W;

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
      hits.current = renderStory(ctx, photo, state);
    };
    const raf = requestAnimationFrame(draw);
    // Re-render once web fonts finish loading so previews never stay on fallback faces.
    document.fonts?.ready.then(() => requestAnimationFrame(draw));
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [photo, state, width, height]);

  const interactive = Boolean(onDragText || onDragPhoto);
  const toStory = (e: React.PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * STORY_W, y: ((e.clientY - r.top) / r.height) * STORY_H };
  };

  return (
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
              const pad = 40;
              const inside = (k: TextKey) => {
                const b = hits.current?.[k];
                return b && p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad;
              };
              const target: TextKey | "photo" = inside("headline") ? "headline" : inside("caption") ? "caption" : "photo";
              if (target !== "photo") onSelectText?.(target);
              drag.current = { target, x: p.x, y: p.y };
              e.currentTarget.setPointerCapture(e.pointerId);
            }
          : undefined
      }
      onPointerMove={
        interactive
          ? (e) => {
              const d = drag.current;
              if (!d) return;
              const p = toStory(e);
              const dx = (p.x - d.x) / STORY_W;
              const dy = (p.y - d.y) / STORY_H;
              drag.current = { ...d, x: p.x, y: p.y };
              if (d.target === "photo") onDragPhoto?.(dx, dy);
              else onDragText?.(d.target, dx, dy);
            }
          : undefined
      }
      onPointerUp={interactive ? () => (drag.current = null) : undefined}
      onPointerCancel={interactive ? () => (drag.current = null) : undefined}
    />
  );
}
