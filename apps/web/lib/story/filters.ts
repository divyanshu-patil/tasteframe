// Photo filters ("looks"), modelled on the film/tone references in design-refs/pinterest/filters.
// Applied once per (photo, filter) to a cached canvas with plain per-pixel math — no ctx.filter —
// so previews and the 1080×1920 export are identical in every browser.
import type { Photo } from "./draw";

export const FILTERS = [
  { id: "none", name: "Original" },
  { id: "film", name: "Film" }, // Portra-ish: lifted blacks, warm highlights, soft greens
  { id: "warm", name: "Warm" },
  { id: "golden", name: "Golden hour" },
  { id: "cool", name: "Cool" },
  { id: "faded", name: "Faded" },
  { id: "vivid", name: "Vivid" },
  { id: "sepia", name: "Sepia" },
  { id: "bw", name: "B&W" },
  { id: "noir", name: "Noir" },
  { id: "8mm", name: "8mm" },
  { id: "xerox", name: "Xerox" }, // photocopy: crushed tones + toner speckle
] as const;
export type FilterId = (typeof FILTERS)[number]["id"];
export const FILTER_IDS = FILTERS.map((f) => f.id) as FilterId[];

type Px = [number, number, number];
const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);
const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;
const sat = ([r, g, b]: Px, s: number): Px => {
  const l = lum(r, g, b);
  return [l + (r - l) * s, l + (g - l) * s, l + (b - l) * s];
};
const contrast = (v: number, c: number) => (v - 128) * c + 128;
const lift = (v: number, black: number, white = 255) => black + (v / 255) * (white - black);

/** Pure per-pixel transform for each filter (exported for tests). */
export function applyFilterPixel(id: FilterId, px: Px): Px {
  let [r, g, b] = px;
  switch (id) {
    case "none":
      return px;
    case "film":
      [r, g, b] = sat([r, g, b], 0.85);
      return [lift(contrast(r, 0.92) + 10, 18), lift(contrast(g, 0.92) + 6, 20), lift(contrast(b, 0.92) - 4, 24, 236)];
    case "warm":
      return [r * 1.08 + 8, g * 1.02 + 2, b * 0.9 - 4];
    case "golden":
      [r, g, b] = sat([r, g, b], 1.08);
      return [r * 1.12 + 14, g * 1.04 + 6, b * 0.78 - 6];
    case "cool":
      return [r * 0.92 - 4, g * 0.99, b * 1.1 + 10];
    case "faded":
      [r, g, b] = sat([r, g, b], 0.7);
      return [lift(contrast(r, 0.85), 34, 236), lift(contrast(g, 0.85), 32, 236), lift(contrast(b, 0.85), 36, 238)];
    case "vivid":
      [r, g, b] = sat([r, g, b], 1.35);
      return [contrast(r, 1.12), contrast(g, 1.12), contrast(b, 1.12)];
    case "sepia":
      return [0.393 * r + 0.769 * g + 0.189 * b, 0.349 * r + 0.686 * g + 0.168 * b, 0.272 * r + 0.534 * g + 0.131 * b];
    case "bw": {
      const l = contrast(lum(r, g, b), 1.05);
      return [l, l, l];
    }
    case "noir": {
      const l = contrast(lum(r, g, b), 1.45) - 8;
      return [l, l, l];
    }
    case "8mm":
      [r, g, b] = sat([r, g, b], 0.75);
      return [lift(contrast(r, 0.9) + 12, 24, 240), lift(contrast(g, 0.9) + 4, 22, 232), lift(contrast(b, 0.9) - 10, 26, 214)];
    case "xerox": {
      const l = contrast(lum(r, g, b), 2.1) + 18;
      return [l, l, l];
    }
  }
}

const cache = new WeakMap<object, Map<FilterId, HTMLCanvasElement>>();
const MAX_SIDE = 1600; // enough for a 1080×1920 export; keeps filtering fast

/** Returns the photo with the filter applied (cached). `none` returns the original. */
export function filteredPhoto(photo: Photo, id: FilterId = "none"): Photo {
  if (id === "none" || typeof document === "undefined") return photo;
  let byFilter = cache.get(photo);
  if (!byFilter) cache.set(photo, (byFilter = new Map()));
  const hit = byFilter.get(id);
  if (hit) return hit;
  const scale = Math.min(1, MAX_SIDE / Math.max(photo.width, photo.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(photo.width * scale));
  c.height = Math.max(1, Math.round(photo.height * scale));
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return photo;
  ctx.drawImage(photo, 0, 0, c.width, c.height);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const [r, g, b] = applyFilterPixel(id, [d[i] as number, d[i + 1] as number, d[i + 2] as number]);
    d[i] = clamp(r);
    d[i + 1] = clamp(g);
    d[i + 2] = clamp(b);
  }
  if (id === "8mm") {
    // Soft vignette, like projected super-8 frames.
    const cx = c.width / 2;
    const cy = c.height / 2;
    const maxD = Math.hypot(cx, cy);
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        const k = 1 - 0.45 * Math.max(0, Math.hypot(x - cx, y - cy) / maxD - 0.45) / 0.55;
        const i = (y * c.width + x) * 4;
        d[i] = (d[i] as number) * k;
        d[i + 1] = (d[i + 1] as number) * k;
        d[i + 2] = (d[i + 2] as number) * k;
      }
    }
  }
  if (id === "xerox") {
    // Toner speckle: seeded, so preview and export match.
    let seed = 1234567;
    for (let i = 0; i < d.length; i += 4) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const n = seed / 0x7fffffff;
      const v = d[i] as number;
      const out = n < 0.06 ? v * 0.35 : n > 0.97 ? v + (255 - v) * 0.7 : v;
      d[i] = d[i + 1] = d[i + 2] = out;
    }
  }
  ctx.putImageData(img, 0, 0);
  byFilter.set(id, c);
  return c;
}

const turned = new WeakMap<object, Map<number, HTMLCanvasElement>>();

/** The photo (or mask) turned clockwise by `rot` degrees (cached). 0 returns it unchanged. */
export function rotatedPhoto<T extends Photo>(photo: T, rot = 0): T | HTMLCanvasElement {
  if (!rot || typeof document === "undefined") return photo;
  let byRot = turned.get(photo);
  if (!byRot) turned.set(photo, (byRot = new Map()));
  const hit = byRot.get(rot);
  if (hit) return hit;
  const c = document.createElement("canvas");
  const side = rot === 90 || rot === 270;
  c.width = side ? photo.height : photo.width;
  c.height = side ? photo.width : photo.height;
  const ctx = c.getContext("2d");
  if (!ctx) return photo;
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.drawImage(photo, -photo.width / 2, -photo.height / 2);
  byRot.set(rot, c);
  return c;
}
