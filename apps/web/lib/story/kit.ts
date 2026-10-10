// Shared building blocks for templates (templates.ts and templates-more.ts).
import { type Ctx, type Photo, type TextOpts, fontString, rgba, rng, roundRect, star } from "./draw";
import type { CoverState } from "./cover";
import type { Sticker } from "./stickers";
import type { FilterId } from "./filters";
import type { Rect, StoryState, TemplateId, TemplateInput, TextKey, TextLayer } from "./types";

/** Photos as the template sees them: slot i → (photo, crop). Cycles when slots > photos. */
export interface Slots {
  /** Distinct photos in this Story (1–4). */
  count: number;
  photo(i: number): Photo;
  crop(i: number): StoryState["crop"];
  /** True when slot i shows its own photo (not a repeat of an earlier one). */
  own(i: number): boolean;
  /** Person mask for slot i's photo (null until segmented / when nobody is in it). */
  mask(i: number): (CanvasImageSource & { width: number; height: number }) | null;
  /** `crop` with the user's drag/zoom for box `key` applied (StoryState.views). */
  adjust(key: string, crop: StoryState["crop"]): StoryState["crop"];
}

export interface Template {
  id: TemplateId;
  name: string;
  blurb: string;
  overlayLabel: string;
  decorations: { key: string; label: string; on: boolean }[];
  defaults(input: TemplateInput): Omit<
    StoryState,
    "templateId" | "crop" | "palette" | "stamp" | "accent" | "filter" | "stickers" | "order" | "crops" | "cover" | "tags" | "focus" | "spot" | "outline" | "tracks" | "prop"
  > & { filter?: FilterId };
  /** Song-cover layouts: where the cover sits by default (shown when `show`). */
  cover?: Partial<CoverState>;
  draw(ctx: Ctx, photo: Photo, s: StoryState, slots: Slots): void;
  /** Photo slot rectangles (story units) for drag-to-reframe / drag-to-swap in the editor. */
  slotRects?(s: StoryState, count: number): Rect[];
  /** Shows the configurable die-cut outline (StoryState.outline). */
  outline?: boolean;
  /** Photos start turned this much (crop.rot), e.g. sideways Stories. */
  photoRot?: 90 | 270;
  /** Offers a prop photo (StoryState.prop) in a window when there's no photo of yours for it. */
  prop?: string;
  /** The photo is drawn turned (degrees clockwise) — the editor maps drag directions to match. */
  slotTurn?: 90;
  /** Uses a person cutout (segment.ts); the editor computes masks only for these. */
  needsMask?: boolean;
  /** Distinct photos the layout shows. */
  capacity?: number;
  after?(ctx: Ctx, s: StoryState): void;
  /** Drawn after the headline, before the caption — e.g. a person cutout in front of big words. */
  front?(ctx: Ctx, s: StoryState, slots: Slots): void;
  /** Overlay elements the layout places as regular (draggable) stickers, flagged `layout`. */
  stickers?: (i: TemplateInput) => Sticker[];
  /** Movable boxes (tracking frames, insets, blocks). Defaults in Story px; the user's moves live
   *  in StoryState.boxes. `image` boxes also pan their picture (StoryState.views, same key). */
  boxes?: (s: StoryState, slots: Slots) => {
    key: string;
    label: string;
    r: Rect;
    image?: boolean;
    /** Its colour/opacity are the layout overlay (shown in the box inspector). */
    tinted?: boolean;
    /** Decoration key that puts it behind the person (cutout) when on. */
    layer?: string;
  }[];
  /** Extra boxes showing part of the photo (insets, callouts) — draggable to reframe. */
  views?: (s: StoryState, slots: Slots) => { key: string; r: Rect }[];
  /** Default colour-window rect (0..1) for layouts that use StoryState.spot. */
  spot?: (i: TemplateInput) => Rect;
  text?: Partial<Record<TextKey, TextOpts>>;
}

export const t = (p: Partial<TextLayer> & Pick<TextLayer, "text">): TextLayer => ({
  size: 48,
  color: "#1d1d1b",
  align: "left",
  x: 0.08,
  y: 0.5,
  width: 0.84,
  font: "serif",
  ...p,
});
export const decos = (list: [string, string, boolean][]) =>
  list.map(([key, label, on]) => ({ key, label, on }));
export const on = (s: StoryState, key: string) => s.decorations[key] !== false;

/** A layout box: the user's moved/resized version if any, else the default (Story px). */
export function boxAt(s: StoryState, key: string, def: Rect): Rect {
  const b = s.boxes?.[key];
  return b ? { x: b.x * 1080, y: b.y * 1920, w: b.w * 1080, h: b.h * 1920 } : def;
}

// Text drawn over the photo goes to the half away from the main subject (e.g. a face in a selfie).
export const subjectLow = (i: TemplateInput) => (i.focus?.y ?? 0.5) > 0.55;
export const subjectHigh = (i: TemplateInput) => (i.focus?.y ?? 0.5) < 0.5 && i.focus !== undefined;

export const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }).toLowerCase();
export const pad = (n: number) => String(n).padStart(2, "0");

export function tornRect(ctx: Ctx, r: Rect, seed: number) {
  const rand = rng(seed);
  ctx.beginPath();
  ctx.moveTo(r.x, r.y);
  for (let x = r.x; x <= r.x + r.w; x += 18) ctx.lineTo(x, r.y + rand() * 10);
  for (let y = r.y; y <= r.y + r.h; y += 18) ctx.lineTo(r.x + r.w - rand() * 8, y);
  for (let x = r.x + r.w; x >= r.x; x -= 18) ctx.lineTo(x, r.y + r.h - rand() * 10);
  for (let y = r.y + r.h; y >= r.y; y -= 18) ctx.lineTo(r.x + rand() * 8, y);
  ctx.closePath();
}

export function tape(ctx: Ctx, cx: number, cy: number, angle: number, color: string) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.fillStyle = rgba(color, 0.78);
  ctx.fillRect(-110, -32, 220, 64);
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  for (let x = -100; x < 110; x += 36) ctx.fillRect(x, -32, 14, 64);
  ctx.restore();
}

/** Perforated postage stamp with an ember sunburst (DESIGN.md "Stamp Seal"). */
export function stamp(ctx: Ctx, x: number, y: number, s: StoryState) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(0.08);
  ctx.fillStyle = "#f6f1e7";
  roundRect(ctx, { x: 0, y: 0, w: 170, h: 210 }, 12);
  ctx.fill();
  ctx.fillStyle = "#efe6d8";
  for (let i = 10; i < 170; i += 20) {
    for (const yy of [0, 210]) { ctx.beginPath(); ctx.arc(i, yy, 6, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.fillStyle = "#c03f13";
  star(ctx, 85, 90, 56, 16, 0.55);
  ctx.fill();
  ctx.fillStyle = "#1d1d1b";
  ctx.font = fontString("mono", 14);
  ctx.textBaseline = "top";
  ctx.fillText(`NO. ${s.stamp.replace(/\D/g, "")}`, 20, 170);
  ctx.restore();
}

