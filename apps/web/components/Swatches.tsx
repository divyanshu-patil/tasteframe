"use client";

import { useEffect, useRef } from "react";
import type { Photo } from "../lib/story/draw";
import { type FilterId, filteredPhoto } from "../lib/story/filters";
import { type StickerKind, drawSticker } from "../lib/story/stickers";
import { STORY_H, STORY_W } from "../lib/story/types";

const SIZE = 56;

function useSquareCanvas(draw: (ctx: CanvasRenderingContext2D) => void, deps: unknown[]) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = c.height = SIZE * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, SIZE, SIZE);
    draw(ctx);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- callers pass explicit deps
  }, deps);
  return ref;
}

/** Tiny centre-cropped preview of the photo with a filter applied. */
export function FilterSwatch({ photo, filter }: { photo: Photo; filter: FilterId }) {
  const ref = useSquareCanvas((ctx) => {
    const src = filteredPhoto(photo, filter);
    const side = Math.min(src.width, src.height);
    ctx.drawImage(src, (src.width - side) / 2, (src.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  }, [photo, filter]);
  return <canvas ref={ref} style={{ width: SIZE, height: SIZE }} aria-hidden />;
}

/** Sticker drawn at swatch size (rendered by the same code as the Story). */
export function StickerSwatch({ kind, color }: { kind: StickerKind; color: string }) {
  const ref = useSquareCanvas((ctx) => {
    ctx.fillStyle = "#cdc6be";
    ctx.fillRect(0, 0, SIZE, SIZE);
    const k = SIZE / (STORY_W * 0.22);
    ctx.scale(k, k);
    drawSticker(ctx, { id: "swatch", kind, x: (SIZE / k / 2) / STORY_W, y: (SIZE / k / 2) / STORY_H, scale: 0.9, rotate: 0, color, text: kind === "note" ? "hey ♡" : "now playing" });
  }, [kind, color]);
  return <canvas ref={ref} style={{ width: SIZE, height: SIZE }} aria-hidden />;
}

/** Small centre-cropped thumbnail of a photo (Photos panel). */
export function PhotoThumb({ photo }: { photo: Photo }) {
  const ref = useSquareCanvas((ctx) => {
    const side = Math.min(photo.width, photo.height);
    ctx.drawImage(photo, (photo.width - side) / 2, (photo.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  }, [photo]);
  return <canvas ref={ref} style={{ width: SIZE, height: SIZE }} aria-hidden />;
}
