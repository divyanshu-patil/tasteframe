// Compositing a segmented person ("sticker cutout") — the person over type, a die-cut outline,
// colour-inside-B&W, etc. Pure given (photo, mask); no-ops without a DOM or mask.
import { type Ctx, type Photo, drawPhoto } from "./draw";
import type { Crop, Rect } from "./types";

type Mask = CanvasImageSource & { width: number; height: number };

export interface Outline {
  color: string;
  /** Line thickness, Story px. */
  width: number;
  /** Gap between the person and the line, Story px (0 = classic die-cut border). */
  margin?: number;
}

const DOWN = 4; // dilation runs at 1/4 resolution, then scales up (smooth + fast)
const ringCache = new WeakMap<object, Map<string, HTMLCanvasElement>>();

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/** Silhouette grown by `radius` px (at reduced scale), filled with `color`. */
function dilate(sil: HTMLCanvasElement, radius: number, color: string): HTMLCanvasElement {
  const out = canvas(sil.width, sil.height);
  const g = out.getContext("2d");
  if (!g) return out;
  const r = radius / DOWN;
  const rings = Math.max(1, Math.ceil(r / 2));
  for (let k = 1; k <= rings; k++) {
    const rr = (r * k) / rings;
    const steps = Math.max(12, Math.ceil(rr * 3));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      g.drawImage(sil, Math.cos(a) * rr, Math.sin(a) * rr);
    }
  }
  g.drawImage(sil, 0, 0);
  g.globalCompositeOperation = "source-in";
  g.fillStyle = color;
  g.fillRect(0, 0, out.width, out.height);
  return out;
}

/** The outline ring for a cut-out layer, cached per mask + geometry + style. */
function ring(layer: HTMLCanvasElement, mask: object, key: string, o: Outline): HTMLCanvasElement {
  let byKey = ringCache.get(mask);
  if (!byKey) ringCache.set(mask, (byKey = new Map()));
  const hit = byKey.get(key);
  if (hit) return hit;
  const small = canvas(layer.width / DOWN, layer.height / DOWN);
  const sg = small.getContext("2d");
  const out = canvas(layer.width, layer.height);
  const og = out.getContext("2d");
  if (!sg || !og) return out;
  sg.drawImage(layer, 0, 0, small.width, small.height);
  // Harden the soft mask edge so the line is solid, not a grey halo.
  sg.globalCompositeOperation = "source-in";
  sg.fillStyle = "#000";
  sg.fillRect(0, 0, small.width, small.height);
  const margin = Math.max(0, o.margin ?? 0);
  const outer = dilate(small, margin + o.width, o.color);
  const og2 = outer.getContext("2d");
  if (og2 && margin > 0) {
    // Cut the inner part away, leaving a line that floats `margin` px off the person.
    og2.globalCompositeOperation = "destination-out";
    og2.drawImage(dilate(small, margin, "#000"), 0, 0);
  }
  og.imageSmoothingEnabled = true;
  og.imageSmoothingQuality = "high";
  og.drawImage(outer, 0, 0, out.width, out.height);
  if (byKey.size > 24) byKey.clear();
  byKey.set(key, out);
  return out;
}

/** The person from `photo` (masked) drawn into `r` with the same crop as the photo. */
export function drawCutout(ctx: Ctx, photo: Photo, mask: Mask | null, r: Rect, crop: Crop, outline?: Outline): boolean {
  if (!mask || typeof document === "undefined") return false;
  const layer = canvas(r.w, r.h);
  const l = layer.getContext("2d");
  if (!l) return false;
  const local = { x: 0, y: 0, w: r.w, h: r.h };
  drawPhoto(l, photo, local, crop);
  l.globalCompositeOperation = "destination-in";
  drawPhoto(l, mask, local, crop);
  if (outline && outline.width > 0) {
    const key = [r.w, r.h, crop.zoom, crop.x, crop.y, crop.fit, outline.width, outline.margin ?? 0, outline.color].join("|");
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.22)";
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 4;
    ctx.drawImage(ring(layer, mask, key, outline), r.x, r.y);
    ctx.restore();
  }
  ctx.drawImage(layer, r.x, r.y);
  return true;
}
