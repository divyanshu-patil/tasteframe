// Canvas drawing primitives shared by templates. Pure: same inputs → same pixels.
import { familyFont } from "./fonts";
import type { FontRole, Rect, StoryState, TextLayer } from "./types";
import { STORY_H, STORY_W } from "./types";

export type Ctx = CanvasRenderingContext2D;
export type Photo = CanvasImageSource & { width: number; height: number };

const FALLBACK: Record<FontRole, string> = {
  display: "'Bodoni Moda', Didot, serif",
  serif: "'Source Serif 4', Georgia, serif",
  italic: "'Instrument Serif', Georgia, serif",
  sans: "Archivo, 'Helvetica Neue', Arial, sans-serif",
  hand: "Caveat, 'Bradley Hand', cursive",
  mono: "'Space Mono', 'Courier New', monospace",
};
const WEIGHT: Record<FontRole, string> = {
  display: "600",
  serif: "400",
  italic: "italic 400",
  sans: "700",
  hand: "600",
  mono: "400",
};

let resolved: Record<FontRole, string> | null = null;
/** Font stacks come from CSS variables set by next/font in app/layout.tsx. */
export function fontStack(role: FontRole): string {
  if (!resolved && typeof document !== "undefined") {
    const css = getComputedStyle(document.documentElement);
    resolved = { ...FALLBACK };
    for (const r of Object.keys(FALLBACK) as FontRole[]) {
      const v = css.getPropertyValue(`--font-story-${r}`).trim();
      if (v) resolved[r] = v;
    }
  }
  return (resolved ?? FALLBACK)[role];
}

export function fontString(role: FontRole, size: number): string {
  return `${WEIGHT[role]} ${Math.round(size)}px ${fontStack(role)}`;
}

/** A text layer's font: its chosen Google Font (layout font as fallback) or the layout font. */
function layerFont(layer: TextLayer, size: number): string {
  return layer.family ? familyFont(layer.family, layer.font, size, fontStack(layer.font)) : fontString(layer.font, size);
}

/** Seeded PRNG (mulberry32) so decorative randomness is identical in preview and export. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Draw `photo` covering `r`, honoring zoom + focal point, clipped to r. */
export function drawPhoto(
  ctx: Ctx,
  photo: Photo,
  r: Rect,
  crop: StoryState["crop"],
  focalShiftY = 0,
): void {
  if (crop.fit === "contain") {
    // Whole photo visible: blurred fill behind, photo letterboxed on top (zoom still applies).
    drawBlurred(ctx, photo, r, { ...crop, fit: "cover", zoom: 1 });
    const scale = Math.min(r.w / photo.width, r.h / photo.height) * Math.max(1, crop.zoom);
    const w = photo.width * scale;
    const h = photo.height * scale;
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    ctx.drawImage(photo, r.x + (r.w - w) * crop.x, r.y + (r.h - h) * Math.min(1, Math.max(0, crop.y + focalShiftY)), w, h);
    ctx.restore();
    return;
  }
  const scale = Math.max(r.w / photo.width, r.h / photo.height) * Math.max(1, crop.zoom);
  const w = photo.width * scale;
  const h = photo.height * scale;
  const fy = Math.min(1, Math.max(0, crop.y + focalShiftY));
  const x = r.x + (r.w - w) * Math.min(1, Math.max(0, crop.x));
  const y = r.y + (r.h - h) * fy;
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  ctx.drawImage(photo, x, y, w, h);
  ctx.restore();
}

/** Cheap, cross-browser blur: downscale then upscale with smoothing (no ctx.filter needed). */
export function drawBlurred(ctx: Ctx, photo: Photo, r: Rect, crop: StoryState["crop"]): void {
  if (typeof document === "undefined") return drawPhoto(ctx, photo, r, { ...crop, fit: "cover" });
  const small = document.createElement("canvas");
  small.width = 36;
  small.height = 64;
  const s = small.getContext("2d");
  if (!s) return drawPhoto(ctx, photo, r, { ...crop, fit: "cover" });
  drawPhoto(s, photo, { x: 0, y: 0, w: 36, h: 64 }, { ...crop, fit: "cover" });
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  // Upscaling a tiny canvas alone looks blocky; a real blur pass smooths it where supported.
  ctx.filter = "blur(28px)";
  ctx.drawImage(small, r.x - 60, r.y - 60, r.w + 120, r.h + 120);
  ctx.restore();
}

const noiseCache = new Map<number, HTMLCanvasElement>();
/** Film grain: a seeded 256px noise tile, repeated. */
export function drawGrain(ctx: Ctx, alpha: number, seed = 7): void {
  if (typeof document === "undefined" || alpha <= 0) return;
  let tile = noiseCache.get(seed);
  if (!tile) {
    tile = document.createElement("canvas");
    tile.width = tile.height = 256;
    const t = tile.getContext("2d");
    if (!t) return;
    const img = t.createImageData(256, 256);
    const rand = rng(seed);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.floor(rand() * 255);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    t.putImageData(img, 0, 0);
    noiseCache.set(seed, tile);
  }
  const pattern = ctx.createPattern(tile, "repeat");
  if (!pattern) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = "overlay";
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, STORY_W, STORY_H);
  ctx.restore();
}

function wrap(ctx: Ctx, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxW) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

export interface TextOpts {
  shadow?: boolean;
  lineHeight?: number;
  tracking?: number; // em
  rotate?: number; // radians around the block anchor
  outline?: number; // stroke width: outlined letters instead of filled
  /** Shrink the type so no line (even one long word) is wider than the layer width. */
  fit?: boolean;
  /** Keep the text on a single line (mastheads); combine with `fit`. */
  oneLine?: boolean;
  /** Per-line size multipliers, cycled (e.g. [1.5, 1] for big/small alternating lines). */
  lineScale?: number[];
}

/** Draw a text layer; returns its bounding box (for hit-testing / dragging in the editor). */
export function drawText(ctx: Ctx, layer: TextLayer, opts: TextOpts = {}): Rect {
  if (!layer.text.trim()) {
    return { x: layer.x * STORY_W, y: layer.y * STORY_H, w: 0, h: 0 };
  }
  ctx.save();
  ctx.font = layerFont(layer, layer.size);
  if ("letterSpacing" in ctx) {
    const em = opts.tracking ?? (layer.font === "display" || layer.font === "sans" ? -0.03 : 0);
    ctx.letterSpacing = `${(em * layer.size).toFixed(1)}px`;
  }
  ctx.fillStyle = layer.color;
  ctx.textAlign = layer.align;
  ctx.textBaseline = "top";
  const maxW = layer.width * STORY_W;
  // Mixed-size lines (lineScale) follow the typed line breaks; other text wraps to the width.
  let lines = opts.oneLine
    ? [layer.text.replace(/\s*\n\s*/g, " ")]
    : opts.lineScale?.length
      ? layer.text.split("\n")
      : wrap(ctx, layer.text, maxW);
  if (opts.fit) {
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    if (widest > maxW) {
      layer = { ...layer, size: Math.max(12, Math.floor(layer.size * (maxW / widest) * 0.99)) };
      ctx.font = layerFont(layer, layer.size);
      if (!opts.oneLine) lines = wrap(ctx, layer.text, maxW);
    }
  }
  const lh = layer.size * (opts.lineHeight ?? (layer.font === "display" ? 0.95 : 1.2));
  const ax = layer.x * STORY_W;
  const ay = layer.y * STORY_H;
  if (opts.rotate) {
    ctx.translate(ax, ay);
    ctx.rotate(opts.rotate);
    ctx.translate(-ax, -ay);
  }
  if (opts.shadow) {
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = layer.size * 0.35;
    ctx.shadowOffsetY = 2;
  }
  let widest = 0;
  let y = ay;
  lines.forEach((l, i) => {
    const k = opts.lineScale?.length ? opts.lineScale[i % opts.lineScale.length]! : 1;
    if (opts.lineScale?.length) ctx.font = layerFont(layer, layer.size * k);
    if (opts.outline) {
      ctx.strokeStyle = layer.color;
      ctx.lineWidth = opts.outline;
      ctx.strokeText(l, ax, y);
    } else ctx.fillText(l, ax, y);
    widest = Math.max(widest, ctx.measureText(l).width);
    y += lh * k;
  });
  ctx.restore();
  const left = layer.align === "left" ? ax : layer.align === "center" ? ax - widest / 2 : ax - widest;
  const box = { x: left, y: ay, w: widest, h: y - ay };
  if (!opts.rotate) return box;
  // Rotated text: the axis-aligned box around the rotated block (for hit-testing/selection).
  const c = Math.cos(opts.rotate);
  const sn = Math.sin(opts.rotate);
  const pts = [[box.x, box.y], [box.x + box.w, box.y], [box.x, box.y + box.h], [box.x + box.w, box.y + box.h]].map(([x, y]) => [
    ax + (x! - ax) * c - (y! - ay) * sn,
    ay + (x! - ax) * sn + (y! - ay) * c,
  ]);
  const xs = pts.map((q) => q[0]!);
  const ys = pts.map((q) => q[1]!);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1] as string, 16) : 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** WCAG relative luminance, used to keep text legible against template backgrounds. */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Pick `preferred` if readable on `bg` (≥ 3:1 for large text), else ink or paper. */
export function readableOn(bg: string, preferred: string): string {
  if (contrastRatio(bg, preferred) >= 3) return preferred;
  return contrastRatio(bg, "#1d1d1b") >= contrastRatio(bg, "#f4efe6") ? "#1d1d1b" : "#f4efe6";
}

export function star(ctx: Ctx, cx: number, cy: number, r: number, points = 5, inset = 0.45): void {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 ? r * inset : r;
    const a = (Math.PI * i) / points - Math.PI / 2;
    ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  ctx.closePath();
}

export function roundRect(ctx: Ctx, r: Rect, radius: number): void {
  ctx.beginPath();
  ctx.moveTo(r.x + radius, r.y);
  ctx.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + r.h, radius);
  ctx.arcTo(r.x + r.w, r.y + r.h, r.x, r.y + r.h, radius);
  ctx.arcTo(r.x, r.y + r.h, r.x, r.y, radius);
  ctx.arcTo(r.x, r.y, r.x + r.w, r.y, radius);
  ctx.closePath();
}
