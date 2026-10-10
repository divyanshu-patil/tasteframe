// Square song cover ("album art") placed anywhere on the Story — over a face, floating beside
// the subject, inside a player card… Modelled on design-refs/pinterest/cover1-4. The image comes
// from the API (/v1/music/artwork, Apple Music artwork) or the user's upload; without one, a
// square crop of photo 1 stands in.
import { type Ctx, type Photo, fontString, rgba, roundRect } from "./draw";
import type { Rect, StoryState } from "./types";
import { STORY_H as H, STORY_W as W } from "./types";

export type CoverStyle = "plain" | "card" | "bubble" | "sticker";

export interface CoverState {
  show: boolean;
  x: number; // 0..1 centre of the square
  y: number;
  scale: number; // 1 = 300px square
  rotate: number; // degrees
  style: CoverStyle;
  title: string;
  artist: string;
  /** Apple Music track whose artwork is shown (refetched when a saved Story reopens). */
  trackId?: number;
}

export const COVER_BASE = 300;

export const DEFAULT_COVER: CoverState = {
  show: false,
  x: 0.72,
  y: 0.38,
  scale: 1,
  rotate: -6,
  style: "sticker",
  title: "",
  artist: "",
};

/** Square around the cover itself (story units) — used for dragging in the editor. */
export function coverBounds(c: CoverState): Rect {
  const size = COVER_BASE * c.scale;
  const pad = c.style === "card" ? size * 0.12 : c.style === "bubble" ? size * 0.18 : 0;
  const extraH = c.style === "card" ? size * 0.62 : c.style === "sticker" ? size * 0.3 : c.style === "bubble" ? size * 0.5 : 0;
  return { x: c.x * W - size / 2 - pad, y: c.y * H - size / 2 - pad, w: size + pad * 2, h: size + pad * 2 + extraH };
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

function bars(ctx: Ctx, x: number, y: number, w: number, color: string) {
  ctx.fillStyle = rgba(color, 0.3);
  roundRect(ctx, { x, y, w, h: 6 }, 3);
  ctx.fill();
  ctx.fillStyle = color;
  roundRect(ctx, { x, y, w: w * 0.42, h: 6 }, 3);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + w * 0.42, y + 3, 9, 0, Math.PI * 2);
  ctx.fill();
}

function controls(ctx: Ctx, cx: number, cy: number, s: number, color: string) {
  ctx.fillStyle = color;
  const tri = (x: number, dir: 1 | -1) => {
    ctx.beginPath();
    ctx.moveTo(x, cy - 14 * s);
    ctx.lineTo(x + dir * 18 * s, cy);
    ctx.lineTo(x, cy + 14 * s);
    ctx.fill();
  };
  tri(cx - 70 * s, -1);
  tri(cx - 52 * s, -1);
  tri(cx + 70 * s, 1);
  tri(cx + 52 * s, 1);
  ctx.fillRect(cx - 12 * s, cy - 16 * s, 8 * s, 32 * s);
  ctx.fillRect(cx + 4 * s, cy - 16 * s, 8 * s, 32 * s);
}

function label(ctx: Ctx, text: string, x: number, y: number, size: number, color: string, maxW: number, role: "sans" | "serif" = "sans") {
  if (!text) return;
  ctx.font = fontString(role, size);
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
    case "plain": {
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.35)";
      ctx.shadowBlur = size * 0.08;
      ctx.fillStyle = "#000";
      ctx.fillRect(x, y, size, size);
      ctx.restore();
      drawSquare(ctx, cover, fallback, x, y, size, 0);
      // Small caption under the square, like the "cover over face" trend.
      ctx.textAlign = "center";
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 8;
      label(ctx, title, cx, y + size + size * 0.05, size * 0.08, "#ffffff", size * 1.4, "sans");
      label(ctx, artist, cx, y + size + size * 0.15, size * 0.065, "#e8e3da", size * 1.4, "serif");
      break;
    }
    case "card": {
      const pad = size * 0.12;
      const card = { x: x - pad, y: y - pad, w: size + pad * 2, h: size + pad * 2 + size * 0.62 };
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.35)";
      ctx.shadowBlur = 30;
      ctx.fillStyle = "rgba(28,26,30,0.78)";
      roundRect(ctx, card, size * 0.12);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 2;
      roundRect(ctx, card, size * 0.12);
      ctx.stroke();
      drawSquare(ctx, cover, fallback, x, y, size, size * 0.06);
      label(ctx, title, x, y + size + size * 0.06, size * 0.085, "#ffffff", size);
      label(ctx, artist, x, y + size + size * 0.17, size * 0.07, "#bdb6c4", size, "serif");
      bars(ctx, x, y + size + size * 0.3, size, "#ffffff");
      controls(ctx, cx, y + size + size * 0.45, size / 300, "#ffffff");
      break;
    }
    case "bubble": {
      const pad = size * 0.18;
      const r = { x: x - pad, y: y - pad, w: size + pad * 2, h: size * 0.62 + pad * 2 };
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.3)";
      ctx.shadowBlur = 24;
      ctx.fillStyle = "#6b1f2a";
      roundRect(ctx, r, size * 0.1);
      ctx.fill();
      // Speech-bubble tail.
      ctx.beginPath();
      ctx.moveTo(r.x + r.w * 0.7, r.y + r.h - 2);
      ctx.lineTo(r.x + r.w * 0.85, r.y + r.h + size * 0.35);
      ctx.lineTo(r.x + r.w * 0.5, r.y + r.h - 2);
      ctx.fill();
      ctx.restore();
      const art = size * 0.45;
      drawSquare(ctx, cover, fallback, x, y, art, size * 0.04);
      label(ctx, title.toUpperCase(), x + art + size * 0.07, y + size * 0.04, size * 0.075, "#ffffff", size * 0.55);
      label(ctx, artist, x + art + size * 0.07, y + size * 0.14, size * 0.065, "#e9b8bf", size * 0.55, "serif");
      bars(ctx, x + art + size * 0.07, y + size * 0.3, size * 0.48, "#ffffff");
      controls(ctx, x + size * 0.5, y + art + size * 0.12, size / 420, "#ffffff");
      break;
    }
    case "sticker": {
      // Instagram-style music sticker: cover with a title strip.
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.3)";
      ctx.shadowBlur = 20;
      ctx.fillStyle = "#ffffff";
      roundRect(ctx, { x: x - 10, y: y - 10, w: size + 20, h: size + size * 0.3 + 20 }, size * 0.07);
      ctx.fill();
      ctx.restore();
      drawSquare(ctx, cover, fallback, x, y, size, size * 0.05);
      label(ctx, title, x + 4, y + size + size * 0.05, size * 0.085, "#1d1d1b", size - 8);
      label(ctx, artist, x + 4, y + size + size * 0.16, size * 0.07, "#69645f", size - 8, "serif");
      break;
    }
  }
  ctx.restore();
}
