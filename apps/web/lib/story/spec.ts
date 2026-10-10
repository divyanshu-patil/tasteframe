// Declarative layouts: a Spec (background + photo frames + decorations + text defaults) becomes
// a Template. Used for the "aesthetic" catalogue (layouts-aesthetic.ts) so each layout is a short
// data description instead of bespoke drawing code. Deterministic; no randomness except rng().
import type { CoverState } from "./cover";
import { type Ctx, type Photo, drawBlurred, drawGrain, drawPhoto, fontString, rgba, rng, roundRect } from "./draw";
import type { FilterId } from "./filters";
import { type Slots, type Template, decos, fmtDate, on, t } from "./kit";
import { type StickerKind, drawSticker } from "./stickers";
import type { FontRole, Rect, StoryState, TemplateId, TemplateInput, TextLayer } from "./types";
import { STORY_H as H, STORY_W as W } from "./types";

export type Shape = "rect" | "round" | "circle" | "arch" | "pill" | "polaroid" | "torn" | "phone" | "diagTop" | "diagBottom" | "blob";

export interface FrameSpec {
  slot: number;
  r: Rect;
  shape?: Shape;
  rot?: number; // degrees
  border?: string;
  borderW?: number;
  shadow?: boolean;
  radius?: number;
}

type Txt = string; // may contain {weekday} {WEEKDAY} {day} {month} {MONTH} {year} {date} {headline} {tag0..}
export type DecoSpec =
  | { k: "rect"; r: Rect; color: string; alpha?: number; rot?: number; radius?: number }
  | { k: "circle"; x: number; y: number; rad: number; color: string; alpha?: number; stroke?: number }
  | { k: "line"; x1: number; y1: number; x2: number; y2: number; color: string; lw?: number; dash?: number[] }
  | { k: "text"; text: Txt; x: number; y: number; size: number; font: FontRole; color: string; align?: CanvasTextAlign; rot?: number; alpha?: number }
  | { k: "sticker"; kind: StickerKind; x: number; y: number; scale?: number; rot?: number; color?: string; text?: string }
  | { k: "tape"; x: number; y: number; rot?: number; color?: string; w?: number }
  | { k: "grid"; step: number; color: string; alpha: number }
  | { k: "dots"; step: number; color: string; alpha: number }
  | { k: "barcode"; r: Rect; color?: string }
  | { k: "vignette"; strength: number }
  | { k: "grain"; alpha: number }
  | { k: "squiggle"; x: number; y: number; w: number; color: string }
  | { k: "scribble"; r: Rect; color: string }
  | { k: "checklist"; x: number; y: number; size: number; color: string }
  | { k: "calendar"; r: Rect; color: string; accent: string }
  | { k: "receipt"; r: Rect }
  | { k: "gradient"; from: string; to: string; y0: number; y1: number; alpha: number }
  | { k: "photo"; slot: number; r: Rect; shape?: Shape; rot?: number; zoom?: number; dx?: number; dy?: number; alpha?: number };

export interface Spec {
  id: TemplateId;
  name: string;
  blurb: string;
  capacity?: number;
  bg: { kind: "color" | "photo" | "blur" | "paper"; color?: string };
  overlay?: { strength: number; color: string };
  overlayLabel?: string;
  filter?: FilterId;
  under?: DecoSpec[];
  frames: FrameSpec[];
  deco?: DecoSpec[];
  headline: Partial<TextLayer> | ((i: TemplateInput) => Partial<TextLayer>);
  caption: Partial<TextLayer> | ((i: TemplateInput) => Partial<TextLayer>);
  text?: Template["text"];
  cover?: Partial<CoverState>;
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** Date parts from the Story's deterministic stamp ('YY MM DD). */
export function stampDate(stamp: string): Date {
  const m = /'(\d\d) (\d\d) (\d\d)/.exec(stamp);
  return m ? new Date(2000 + Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(2026, 0, 1);
}

export function fill(text: Txt, s: StoryState): string {
  const d = stampDate(s.stamp);
  const tags = s.tags ?? [];
  return text
    .replace(/\{weekday\}/g, WEEKDAYS[d.getDay()]!)
    .replace(/\{WEEKDAY\}/g, WEEKDAYS[d.getDay()]!.toUpperCase())
    .replace(/\{day\}/g, String(d.getDate()).padStart(2, "0"))
    .replace(/\{month\}/g, MONTHS[d.getMonth()]!)
    .replace(/\{MONTH\}/g, MONTHS[d.getMonth()]!.toUpperCase())
    .replace(/\{year\}/g, String(d.getFullYear()))
    .replace(/\{date\}/g, fmtDate(d))
    .replace(/\{WD3\}/g, WEEKDAYS[d.getDay()]!.slice(0, 3).toUpperCase())
    .replace(/\{wdA\}/g, WEEKDAYS[d.getDay()]!.slice(0, Math.ceil(WEEKDAYS[d.getDay()]!.length / 2)))
    .replace(/\{wdB\}/g, WEEKDAYS[d.getDay()]!.slice(Math.ceil(WEEKDAYS[d.getDay()]!.length / 2)))
    .replace(/\{mm\}/g, String(d.getMonth() + 1).padStart(2, "0"))
    .replace(/\{yy\}/g, String(d.getFullYear() % 100).padStart(2, "0"))
    .replace(/\{stamp\}/g, s.stamp)
    .replace(/\{headline\}/g, s.headline.text)
    .replace(/\{tag(\d)\}/g, (_, i: string) => tags[Number(i)] ?? "");
}

function shapePath(ctx: Ctx, r: Rect, shape: Shape, radius = 24, seed = 1) {
  ctx.beginPath();
  switch (shape) {
    case "round":
      roundRect(ctx, r, radius);
      return;
    case "pill":
      roundRect(ctx, r, Math.min(r.w, r.h) / 2);
      return;
    case "circle":
      ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
      return;
    case "arch":
      ctx.moveTo(r.x, r.y + r.h);
      ctx.lineTo(r.x, r.y + r.w / 2);
      ctx.arc(r.x + r.w / 2, r.y + r.w / 2, r.w / 2, Math.PI, 0);
      ctx.lineTo(r.x + r.w, r.y + r.h);
      ctx.closePath();
      return;
    case "diagTop":
      ctx.moveTo(r.x, r.y);
      ctx.lineTo(r.x + r.w, r.y);
      ctx.lineTo(r.x + r.w, r.y + r.h * 0.78);
      ctx.lineTo(r.x, r.y + r.h);
      ctx.closePath();
      return;
    case "diagBottom":
      ctx.moveTo(r.x, r.y + r.h * 0.22);
      ctx.lineTo(r.x + r.w, r.y);
      ctx.lineTo(r.x + r.w, r.y + r.h);
      ctx.lineTo(r.x, r.y + r.h);
      ctx.closePath();
      return;
    case "torn": {
      const rand = rng(seed);
      ctx.moveTo(r.x, r.y);
      for (let x = r.x; x <= r.x + r.w; x += 20) ctx.lineTo(x, r.y + rand() * 16);
      for (let y = r.y; y <= r.y + r.h; y += 20) ctx.lineTo(r.x + r.w - rand() * 12, y);
      for (let x = r.x + r.w; x >= r.x; x -= 20) ctx.lineTo(x, r.y + r.h - rand() * 16);
      for (let y = r.y + r.h; y >= r.y; y -= 20) ctx.lineTo(r.x + rand() * 12, y);
      ctx.closePath();
      return;
    }
    case "blob": {
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      const rand = rng(seed + 7);
      const pts = 9;
      for (let i = 0; i <= pts; i++) {
        const a = (i / pts) * Math.PI * 2;
        const k = 0.86 + rand() * 0.14;
        const px = cx + Math.cos(a) * (r.w / 2) * k;
        const py = cy + Math.sin(a) * (r.h / 2) * k;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      return;
    }
    default:
      ctx.rect(r.x, r.y, r.w, r.h);
  }
}

function withRot(ctx: Ctx, r: Rect, deg: number | undefined, fn: () => void) {
  if (!deg) return fn();
  ctx.save();
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  ctx.translate(cx, cy);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.translate(-cx, -cy);
  fn();
  ctx.restore();
}

function photoInto(ctx: Ctx, slots: Slots, slot: number, r: Rect, shape: Shape, radius: number, shift?: { zoom?: number; dx?: number; dy?: number }) {
  ctx.save();
  shapePath(ctx, r, shape, radius, slot + 3);
  ctx.clip();
  const own = slots.own(slot);
  const base = slots.crop(own ? slot : 0);
  const sh = own && !shift ? { zoom: 1, dx: 0, dy: 0 } : { zoom: shift?.zoom ?? 1 + 0.35 * slot, dx: shift?.dx ?? 0.2 * (slot % 2 ? 1 : -1), dy: shift?.dy ?? 0.15 * slot };
  drawPhoto(ctx, slots.photo(own ? slot : 0), r, {
    ...base,
    zoom: base.zoom * (sh.zoom ?? 1),
    x: Math.min(1, Math.max(0, base.x + (sh.dx ?? 0))),
    y: Math.min(1, Math.max(0, base.y + (sh.dy ?? 0))),
  });
  ctx.restore();
}

function drawFrame(ctx: Ctx, f: FrameSpec, slots: Slots) {
  const shape = f.shape ?? "rect";
  withRot(ctx, f.r, f.rot, () => {
    if (shape === "polaroid") {
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.3)";
      ctx.shadowBlur = 24;
      ctx.shadowOffsetY = 8;
      ctx.fillStyle = f.border ?? "#fbfaf6";
      ctx.fillRect(f.r.x - 22, f.r.y - 22, f.r.w + 44, f.r.h + 22 + 100);
      ctx.restore();
      photoInto(ctx, slots, f.slot, f.r, "rect", 0);
      return;
    }
    if (shape === "phone") {
      ctx.save();
      ctx.fillStyle = "#111";
      ctx.shadowColor = "rgba(0,0,0,0.35)";
      ctx.shadowBlur = 30;
      roundRect(ctx, { x: f.r.x - 22, y: f.r.y - 22, w: f.r.w + 44, h: f.r.h + 44 }, 70);
      ctx.fill();
      ctx.restore();
      photoInto(ctx, slots, f.slot, f.r, "round", 50);
      ctx.fillStyle = "#111";
      roundRect(ctx, { x: f.r.x + f.r.w / 2 - 70, y: f.r.y + 14, w: 140, h: 36 }, 18);
      ctx.fill();
      return;
    }
    if (f.shadow) {
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.3)";
      ctx.shadowBlur = 28;
      ctx.shadowOffsetY = 8;
      ctx.fillStyle = f.border ?? "#000";
      shapePath(ctx, f.r, shape, f.radius ?? 24, f.slot + 3);
      ctx.fill();
      ctx.restore();
    }
    photoInto(ctx, slots, f.slot, f.r, shape, f.radius ?? 24);
    if (f.border && (f.borderW ?? 0) > 0) {
      ctx.strokeStyle = f.border;
      ctx.lineWidth = f.borderW ?? 8;
      shapePath(ctx, f.r, shape, f.radius ?? 24, f.slot + 3);
      ctx.stroke();
    }
  });
}

function drawDeco(ctx: Ctx, d: DecoSpec, s: StoryState, slots: Slots) {
  ctx.save();
  switch (d.k) {
    case "rect":
      withRot(ctx, d.r, d.rot, () => {
        ctx.fillStyle = rgba(d.color, d.alpha ?? 1);
        if (d.radius) {
          roundRect(ctx, d.r, d.radius);
          ctx.fill();
        } else ctx.fillRect(d.r.x, d.r.y, d.r.w, d.r.h);
      });
      break;
    case "circle":
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.rad, 0, Math.PI * 2);
      if (d.stroke) {
        ctx.strokeStyle = rgba(d.color, d.alpha ?? 1);
        ctx.lineWidth = d.stroke;
        ctx.stroke();
      } else {
        ctx.fillStyle = rgba(d.color, d.alpha ?? 1);
        ctx.fill();
      }
      break;
    case "line":
      ctx.strokeStyle = d.color;
      ctx.lineWidth = d.lw ?? 2;
      if (d.dash) ctx.setLineDash(d.dash);
      ctx.beginPath();
      ctx.moveTo(d.x1, d.y1);
      ctx.lineTo(d.x2, d.y2);
      ctx.stroke();
      break;
    case "text": {
      const txt = fill(d.text, s);
      ctx.translate(d.x, d.y);
      if (d.rot) ctx.rotate((d.rot * Math.PI) / 180);
      ctx.font = fontString(d.font, d.size);
      ctx.fillStyle = rgba(d.color, d.alpha ?? 1);
      ctx.textAlign = d.align ?? "left";
      ctx.textBaseline = "top";
      txt.split("\n").forEach((line, i) => ctx.fillText(line, 0, i * d.size * 1.05));
      break;
    }
    case "sticker":
      drawSticker(ctx, { id: "deco", kind: d.kind, x: d.x / W, y: d.y / H, scale: d.scale ?? 0.8, rotate: d.rot ?? 0, color: d.color ?? "#d9a62e", text: d.text ? fill(d.text, s) : undefined });
      break;
    case "tape":
      withRot(ctx, { x: d.x - (d.w ?? 200) / 2, y: d.y - 28, w: d.w ?? 200, h: 56 }, d.rot ?? -8, () => {
        const w = d.w ?? 200;
        ctx.fillStyle = rgba(d.color ?? "#e2d5bf", 0.82);
        ctx.fillRect(d.x - w / 2, d.y - 28, w, 56);
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        for (let x = d.x - w / 2 + 10; x < d.x + w / 2 - 10; x += 32) ctx.fillRect(x, d.y - 28, 12, 56);
      });
      break;
    case "grid":
    case "dots": {
      ctx.strokeStyle = rgba(d.color, d.alpha);
      ctx.fillStyle = rgba(d.color, d.alpha);
      ctx.lineWidth = 1.5;
      for (let x = 0; x <= W; x += d.step) {
        for (let y = 0; y <= H; y += d.step) {
          if (d.k === "dots") ctx.fillRect(x, y, 4, 4);
        }
        if (d.k === "grid") {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, H);
          ctx.stroke();
        }
      }
      if (d.k === "grid") {
        for (let y = 0; y <= H; y += d.step) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(W, y);
          ctx.stroke();
        }
      }
      break;
    }
    case "barcode": {
      const rand = rng(31);
      ctx.fillStyle = d.color ?? "#1d1d1b";
      for (let x = d.r.x; x < d.r.x + d.r.w; ) {
        const w = 2 + Math.floor(rand() * 6);
        if (rand() > 0.35) ctx.fillRect(x, d.r.y, w, d.r.h);
        x += w + 2;
      }
      break;
    }
    case "vignette": {
      const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.75);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, `rgba(0,0,0,${d.strength})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      break;
    }
    case "gradient": {
      const g = ctx.createLinearGradient(0, d.y0, 0, d.y1);
      g.addColorStop(0, rgba(d.from, d.alpha));
      g.addColorStop(1, rgba(d.to, d.alpha));
      ctx.fillStyle = g;
      ctx.fillRect(0, Math.min(d.y0, d.y1), W, Math.abs(d.y1 - d.y0));
      break;
    }
    case "grain":
      drawGrain(ctx, d.alpha, 101);
      break;
    case "squiggle":
      ctx.strokeStyle = d.color;
      ctx.lineWidth = 8;
      ctx.lineCap = "round";
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) ctx.lineTo(d.x + (d.w * i) / 40, d.y + Math.sin(i / 3) * 13);
      ctx.stroke();
      break;
    case "scribble": {
      const rand = rng(57);
      ctx.strokeStyle = d.color;
      ctx.lineWidth = 5;
      ctx.lineJoin = "round";
      for (let pass = 0; pass < 2; pass++) {
        ctx.beginPath();
        const pts: [number, number][] = [[d.r.x, d.r.y], [d.r.x + d.r.w, d.r.y], [d.r.x + d.r.w, d.r.y + d.r.h], [d.r.x, d.r.y + d.r.h], [d.r.x, d.r.y]];
        pts.forEach(([x, y], i) => {
          const jx = x + (rand() - 0.5) * 18;
          const jy = y + (rand() - 0.5) * 18;
          if (i === 0) ctx.moveTo(jx, jy);
          else ctx.lineTo(jx, jy);
        });
        ctx.stroke();
      }
      break;
    }
    case "checklist": {
      const items = (s.tags?.length ? s.tags : ["good light", "good people", "good day"]).slice(0, 5);
      ctx.font = fontString("hand", d.size);
      ctx.textBaseline = "middle";
      items.forEach((it, i) => {
        const y = d.y + i * d.size * 1.35;
        ctx.strokeStyle = d.color;
        ctx.lineWidth = 3;
        ctx.strokeRect(d.x, y - d.size * 0.35, d.size * 0.7, d.size * 0.7);
        ctx.beginPath();
        ctx.moveTo(d.x + d.size * 0.12, y);
        ctx.lineTo(d.x + d.size * 0.3, y + d.size * 0.2);
        ctx.lineTo(d.x + d.size * 0.62, y - d.size * 0.3);
        ctx.stroke();
        ctx.fillStyle = d.color;
        ctx.fillText(it, d.x + d.size, y);
      });
      break;
    }
    case "calendar": {
      const date = stampDate(s.stamp);
      const first = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
      const days = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      ctx.fillStyle = rgba("#ffffff", 0.92);
      roundRect(ctx, d.r, 22);
      ctx.fill();
      ctx.fillStyle = d.accent;
      ctx.font = fontString("sans", 28);
      ctx.textBaseline = "top";
      ctx.fillText(MONTHS[date.getMonth()]!.toUpperCase(), d.r.x + 24, d.r.y + 20);
      const cw = (d.r.w - 48) / 7;
      ctx.font = fontString("mono", 20);
      for (let i = 0; i < days; i++) {
        const k = i + first;
        const x = d.r.x + 24 + (k % 7) * cw;
        const y = d.r.y + 70 + Math.floor(k / 7) * 40;
        if (i + 1 === date.getDate()) {
          ctx.fillStyle = d.accent;
          ctx.beginPath();
          ctx.arc(x + cw / 2 - 4, y + 10, 17, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#ffffff";
        } else ctx.fillStyle = d.color;
        ctx.textAlign = "center";
        ctx.fillText(String(i + 1), x + cw / 2 - 4, y);
      }
      break;
    }
    case "receipt": {
      const rand = rng(77);
      ctx.fillStyle = "#fbfaf6";
      ctx.shadowColor = "rgba(0,0,0,0.25)";
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.moveTo(d.r.x, d.r.y);
      ctx.lineTo(d.r.x + d.r.w, d.r.y);
      ctx.lineTo(d.r.x + d.r.w, d.r.y + d.r.h);
      for (let x = d.r.x + d.r.w; x >= d.r.x; x -= 20) ctx.lineTo(x, d.r.y + d.r.h - (x / 20) % 2 * 12);
      ctx.closePath();
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.fillStyle = "#1d1d1b";
      ctx.font = fontString("mono", 22);
      ctx.textBaseline = "top";
      ctx.textAlign = "center";
      ctx.fillText("RECEIPT", d.r.x + d.r.w / 2, d.r.y + 24);
      ctx.textAlign = "left";
      ctx.font = fontString("mono", 18);
      const items = (s.tags?.length ? s.tags : ["good vibes", "sunlight", "memories"]).slice(0, 5);
      items.forEach((it, i) => {
        const y = d.r.y + 80 + i * 32;
        ctx.fillText(it.toUpperCase().slice(0, 18), d.r.x + 24, y);
        ctx.textAlign = "right";
        ctx.fillText(`${1 + Math.floor(rand() * 9)}.${Math.floor(rand() * 90 + 10)}`, d.r.x + d.r.w - 24, y);
        ctx.textAlign = "left";
      });
      ctx.fillText("TOTAL ............ PRICELESS", d.r.x + 24, d.r.y + 80 + items.length * 32 + 14);
      break;
    }
    case "photo":
      withRot(ctx, d.r, d.rot, () => {
        ctx.globalAlpha = d.alpha ?? 1;
        photoInto(ctx, slots, d.slot, d.r, d.shape ?? "rect", 20, { zoom: d.zoom, dx: d.dx, dy: d.dy });
      });
      break;
  }
  ctx.restore();
}

const resolveText = (v: Spec["headline"], i: TemplateInput) => (typeof v === "function" ? v(i) : v);

/** Turn a declarative Spec into a renderable Template. */
export function fromSpec(spec: Spec): Template {
  const overlay = spec.overlay ?? {
    strength: spec.bg.kind === "photo" ? 0.2 : spec.bg.kind === "blur" ? 0.3 : 0.3,
    color: spec.bg.color ?? (spec.bg.kind === "photo" || spec.bg.kind === "blur" ? "#000000" : "#efebe5"),
  };
  return {
    id: spec.id,
    name: spec.name,
    blurb: spec.blurb,
    overlayLabel: spec.overlayLabel ?? (spec.bg.kind === "photo" || spec.bg.kind === "blur" ? "Photo tint" : "Background"),
    capacity: spec.capacity ?? Math.max(1, new Set(spec.frames.map((f) => f.slot)).size),
    slotRects: () => {
      const bySlot = new Map<number, Rect>();
      for (const f of spec.frames) if (!bySlot.has(f.slot)) bySlot.set(f.slot, f.r);
      if (!bySlot.size) bySlot.set(0, { x: 0, y: 0, w: W, h: H });
      return [...bySlot.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r);
    },
    decorations: decos([["details", "Decorations", true]]),
    defaults: (i) => ({
      headline: t({ text: i.headline, ...resolveText(spec.headline, i) }),
      caption: t({ text: i.caption || fmtDate(i.date), ...resolveText(spec.caption, i) }),
      overlay: { ...overlay },
      decorations: { details: true },
      filter: spec.filter,
    }),
    cover: spec.cover,
    draw(ctx, _photo, s, slots) {
      const bg = spec.bg;
      if (bg.kind === "photo") {
        drawPhoto(ctx, slots.photo(0), { x: 0, y: 0, w: W, h: H }, slots.crop(0));
        ctx.fillStyle = rgba(s.overlay.color, s.overlay.strength);
        ctx.fillRect(0, 0, W, H);
      } else if (bg.kind === "blur") {
        drawBlurred(ctx, slots.photo(0), { x: 0, y: 0, w: W, h: H }, slots.crop(0));
        ctx.fillStyle = rgba(s.overlay.color, s.overlay.strength);
        ctx.fillRect(0, 0, W, H);
      } else {
        ctx.fillStyle = s.overlay.color;
        ctx.fillRect(0, 0, W, H);
        if (bg.kind === "paper") drawGrain(ctx, s.overlay.strength * 0.35, 23);
      }
      const details = on(s, "details");
      if (details) for (const d of spec.under ?? []) drawDeco(ctx, d, s, slots);
      for (const f of spec.frames) drawFrame(ctx, f, slots);
      if (details) for (const d of spec.deco ?? []) drawDeco(ctx, d, s, slots);
    },
    text: spec.text,
  };
}

export type { Photo };
