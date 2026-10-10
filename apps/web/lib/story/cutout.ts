// Compositing a segmented person ("sticker cutout") — the person over type, a white die-cut
// outline, colour-inside-B&W, etc. Pure given (photo, mask); no-ops without a DOM or mask.
import { type Ctx, type Photo, drawPhoto } from "./draw";
import type { Crop, Rect } from "./types";

type Mask = CanvasImageSource & { width: number; height: number };

/** The person from `photo` (masked) drawn into `r` with the same crop as the photo. */
export function drawCutout(ctx: Ctx, photo: Photo, mask: Mask | null, r: Rect, crop: Crop, outline?: { color: string; width: number }): boolean {
  if (!mask || typeof document === "undefined") return false;
  const layer = document.createElement("canvas");
  layer.width = Math.round(r.w);
  layer.height = Math.round(r.h);
  const l = layer.getContext("2d");
  if (!l) return false;
  const local = { x: 0, y: 0, w: r.w, h: r.h };
  drawPhoto(l, photo, local, crop);
  l.globalCompositeOperation = "destination-in";
  drawPhoto(l, mask, local, crop);
  if (outline) {
    // Die-cut border: stamp the silhouette, tinted, in a ring of offsets.
    const sil = document.createElement("canvas");
    sil.width = layer.width;
    sil.height = layer.height;
    const s = sil.getContext("2d");
    if (s) {
      s.drawImage(layer, 0, 0);
      s.globalCompositeOperation = "source-in";
      s.fillStyle = outline.color;
      s.fillRect(0, 0, sil.width, sil.height);
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.25)";
      ctx.shadowBlur = 18;
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        ctx.drawImage(sil, r.x + Math.cos(a) * outline.width, r.y + Math.sin(a) * outline.width);
      }
      ctx.restore();
    }
  }
  ctx.drawImage(layer, r.x, r.y);
  return true;
}
