// Square song cover ("album art") placed anywhere on the Story — over a face, floating beside
// the subject, inside a player card… Modelled on design-refs/pinterest/cover1-4. The image comes
// from the API (/v1/music/artwork, Apple Music artwork) or the user's upload; without one, a
// square crop of photo 1 stands in.
import { type Ctx, type Photo, fontStack, fontString, roundRect } from "./draw";
import type { Rect, StoryState } from "./types";
import { STORY_H as H, STORY_W as W } from "./types";

/** Instagram music-sticker looks: album art + title, the white pill, or art only. */
export type CoverStyle = "ig" | "igpill" | "igart";

export interface CoverState {
  show: boolean;
  x: number; // 0..1 centre of the square
  y: number;
  scale: number; // 1 = 300px square
  rotate: number; // degrees
  style: CoverStyle;
  title: string;
  artist: string;
  /** Title/artist colour under the album art (Instagram lets you tap to switch). */
  textColor?: string;
  /** Apple Music track whose artwork is shown (refetched when a saved Story reopens). */
  trackId?: number;
}

export const COVER_BASE = 300;

export const DEFAULT_COVER: CoverState = {
  show: false,
  x: 0.72,
  y: 0.38,
  scale: 1,
  rotate: 0,
  style: "ig",
  title: "",
  artist: "",
  textColor: "#ffffff",
};

/** Older saved styles → the Instagram ones. */
export function normalizeCoverStyle(v: unknown): CoverStyle {
  if (v === "ig" || v === "igpill" || v === "igart") return v;
  return v === "card" || v === "bubble" ? "igpill" : "ig";
}

const pillSize = (size: number) => ({ w: size * 2.6, h: size * 0.62 });

/** Box around the cover (story units, unrotated) — used for dragging in the editor. */
export function coverBounds(c: CoverState): Rect {
  const size = COVER_BASE * c.scale;
  if (c.style === "igpill") {
    const p = pillSize(size);
    return { x: c.x * W - p.w / 2, y: c.y * H - p.h / 2, w: p.w, h: p.h };
  }
  const extra = c.style === "ig" ? size * 0.32 : 0;
  return { x: c.x * W - size / 2, y: c.y * H - size / 2, w: size, h: size + extra };
}

function drawSquare(ctx: Ctx, img: Photo | null, fallback: Photo, x: number, y: number, size: number, radius: number) {
  ctx.save();
  roundRect(ctx, { x, y, w: size, h: size }, radius);
  ctx.clip();
  const src = img ?? fallback;
  const side = Math.min(src.width, src.height);
  ctx.drawImage(src, (src.width - side) / 2, (src.height - side) / 2, side, side, x, y, size, size);
  ctx.restore();
}

/** Instagram's little "now playing" bars, bottom-left on the art. */
function playingBars(ctx: Ctx, x: number, baseline: number, h: number) {
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = h * 0.4;
  [0.55, 1, 0.75].forEach((k, i) => {
    roundRect(ctx, { x: x + i * h * 0.42, y: baseline - h * k, w: h * 0.24, h: h * k }, h * 0.12);
    ctx.fill();
  });
  ctx.restore();
}

/** Gradient sound-wave on the pill sticker. */
function waveform(ctx: Ctx, cx: number, cy: number, h: number) {
  const g = ctx.createLinearGradient(cx - h, cy, cx + h, cy);
  g.addColorStop(0, "#ff3d77");
  g.addColorStop(1, "#a033ff");
  ctx.fillStyle = g;
  [0.35, 0.7, 1, 0.55, 0.85, 0.4].forEach((k, i) => {
    roundRect(ctx, { x: cx - h * 0.8 + i * h * 0.3, y: cy - (h * k) / 2, w: h * 0.16, h: h * k }, h * 0.08);
    ctx.fill();
  });
}

function label(ctx: Ctx, text: string, x: number, y: number, size: number, color: string, maxW: number, role: "sans" | "serif" = "sans", bold = false) {
  if (!text) return;
  ctx.font = bold ? `700 ${Math.round(size)}px ${fontStack(role)}` : fontString(role, size);
  ctx.fillStyle = color;
  let t = text;
  while (t.length > 1 && ctx.measureText(t).width > maxW) t = t.slice(0, -2) + "…";
  ctx.fillText(t, x, y);
}

/** Draw the cover (if shown) at its state position. `fallback` is photo 1 for the stand-in. */
export function drawCover(ctx: Ctx, s: StoryState, cover: Photo | null, fallback: Photo): void {
  const c = s.cover;
  if (!c?.show) return;
  const size = COVER_BASE * c.scale;
  const cx = c.x * W;
  const cy = c.y * H;
  const title = c.title || "now playing";
  const artist = c.artist;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((c.rotate * Math.PI) / 180);
  ctx.translate(-cx, -cy);
  const x = cx - size / 2;
  const y = cy - size / 2;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  switch (c.style) {
    case "ig":
    case "igart": {
      // Album-art sticker: square art, Instagram's playing bars, title + artist below.
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.28)";
      ctx.shadowBlur = size * 0.06;
      ctx.shadowOffsetY = size * 0.01;
      ctx.fillStyle = "#000";
      roundRect(ctx, { x, y, w: size, h: size }, size * 0.025);
      ctx.fill();
      ctx.restore();
      drawSquare(ctx, cover, fallback, x, y, size, size * 0.025);
      playingBars(ctx, x + size * 0.07, y + size * 0.93, size * 0.075);
      if (c.style === "ig") {
        const col = c.textColor || "#ffffff";
        ctx.textAlign = "center";
        ctx.shadowColor = col === "#ffffff" ? "rgba(0,0,0,0.45)" : "transparent";
        ctx.shadowBlur = 6;
        label(ctx, title, cx, y + size + size * 0.05, size * 0.068, col, size * 1.5, "sans", true);
        label(ctx, artist, cx, y + size + size * 0.14, size * 0.058, col, size * 1.5, "sans");
      }
      break;
    }
    case "igpill": {
      // The compact white music sticker: art thumb, title/artist, gradient sound-wave.
      const p = pillSize(size);
      const r = { x: cx - p.w / 2, y: cy - p.h / 2, w: p.w, h: p.h };
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.25)";
      ctx.shadowBlur = 18;
      ctx.fillStyle = "#ffffff";
      roundRect(ctx, r, p.h * 0.22);
      ctx.fill();
      ctx.restore();
      const art = p.h * 0.76;
      const ax = r.x + (p.h - art) / 2;
      drawSquare(ctx, cover, fallback, ax, r.y + (p.h - art) / 2, art, art * 0.12);
      const tx = ax + art + p.h * 0.18;
      const maxW = r.x + p.w - tx - p.h * 0.9;
      label(ctx, title, tx, r.y + p.h * 0.2, p.h * 0.24, "#262626", maxW, "sans", true);
      label(ctx, artist, tx, r.y + p.h * 0.53, p.h * 0.2, "#8e8e8e", maxW, "sans");
      waveform(ctx, r.x + p.w - p.h * 0.75, cy, p.h * 0.5);
      break;
    }
  }
  ctx.restore();
}
