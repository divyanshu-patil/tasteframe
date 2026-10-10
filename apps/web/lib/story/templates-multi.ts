// Multi-photo layouts (2–4 photos), modelled on design-refs/pinterest/{multi2,multi3,multi4,
// polaroids}. Each declares slotRects so photos can be dragged to reframe or swap in the editor.
import { type Ctx, drawBlurred, drawGrain, drawPhoto, fontString, rgba, rng, roundRect, star } from "./draw";
import { type Slots, type Template, decos, fmtDate, on, t } from "./kit";
import type { Rect, TemplateId } from "./types";
import { STORY_H as H, STORY_W as W } from "./types";

const SHIFTS = [
  { x: 0, y: 0, zoom: 1 },
  { x: 0.28, y: -0.22, zoom: 1.6 },
  { x: -0.25, y: 0.2, zoom: 1.4 },
  { x: 0.2, y: 0.35, zoom: 2 },
];

/** Slot i into rect r: its own photo when available, else a shifted crop of photo 1. */
function put(ctx: Ctx, slots: Slots, i: number, r: Rect, radius = 0) {
  ctx.save();
  if (radius) roundRect(ctx, r, radius);
  else {
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
  }
  ctx.clip();
  if (slots.own(i)) drawPhoto(ctx, slots.photo(i), r, slots.crop(i));
  else {
    const c = slots.adjust(`slot${i}`, slots.crop(0));
    const sh = SHIFTS[i % SHIFTS.length]!;
    drawPhoto(ctx, slots.photo(0), r, {
      ...c,
      zoom: c.zoom * sh.zoom,
      x: Math.min(1, Math.max(0, c.x + sh.x)),
      y: Math.min(1, Math.max(0, c.y + sh.y)),
    });
  }
  ctx.restore();
}

function rotated(ctx: Ctx, cx: number, cy: number, deg: number, fn: () => void) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.translate(-cx, -cy);
  fn();
  ctx.restore();
}

function tapeStrip(ctx: Ctx, cx: number, cy: number, deg: number, color: string, w = 200) {
  rotated(ctx, cx, cy, deg, () => {
    ctx.fillStyle = rgba(color, 0.8);
    ctx.fillRect(cx - w / 2, cy - 28, w, 56);
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    for (let x = cx - w / 2 + 10; x < cx + w / 2 - 10; x += 32) ctx.fillRect(x, cy - 28, 12, 56);
  });
}

function flower(ctx: Ctx, x: number, y: number, r: number, petal: string, centre = "#f2c14e") {
  ctx.save();
  ctx.translate(x, y);
  for (let i = 0; i < 5; i++) {
    ctx.rotate((Math.PI * 2) / 5);
    ctx.fillStyle = petal;
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.55, r * 0.32, r * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = centre;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function squiggle(ctx: Ctx, x: number, y: number, w: number, color = "#1d1d1b") {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 9;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (let i = 0; i <= 40; i++) {
    const px = x + (w * i) / 40;
    ctx.lineTo(px, y + Math.sin(i / 3) * 14);
  }
  ctx.stroke();
  ctx.restore();
}

function polaroidFrame(ctx: Ctx, photoRect: Rect, bottom = 110, pad = 22) {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.3)";
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = "#fbfaf6";
  ctx.fillRect(photoRect.x - pad, photoRect.y - pad, photoRect.w + pad * 2, photoRect.h + pad + bottom);
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
const DUO_A: Rect = { x: 130, y: 350, w: 500, h: 520 };
const DUO_B: Rect = { x: 460, y: 900, w: 500, h: 520 };
const duo: Template = {
  id: "duo",
  name: "Duo Polaroids",
  blurb: "Two staggered polaroids taped to a coloured backdrop, with flowers.",
  overlayLabel: "Backdrop",
  capacity: 2,
  slotRects: () => [DUO_A, DUO_B],
  decorations: decos([
    ["flowers", "Flowers", true],
    ["tape", "Tape", true],
  ]),
  defaults: (i) => ({
    headline: t({ text: i.headline, size: 54, font: "hand", align: "center", x: 0.35, y: 0.468, width: 0.44 }),
    caption: t({ text: i.caption || fmtDate(i.date), size: 40, font: "hand", align: "center", x: 0.66, y: 0.756, width: 0.44, color: "#3a3530" }),
    overlay: { strength: 0.35, color: "#7a2335" },
    decorations: { flowers: true, tape: true },
  }),
  draw(ctx, _p, s, slots) {
    ctx.fillStyle = s.overlay.color;
    ctx.fillRect(0, 0, W, H);
    const blob = ctx.createRadialGradient(300, 500, 40, 300, 500, 900);
    blob.addColorStop(0, rgba("#ffffff", 0.12 * s.overlay.strength * 2));
    blob.addColorStop(1, rgba("#000000", 0.2 * s.overlay.strength));
    ctx.fillStyle = blob;
    ctx.fillRect(0, 0, W, H);
    rotated(ctx, 380, 680, -3, () => {
      polaroidFrame(ctx, DUO_A);
      put(ctx, slots, 0, DUO_A);
    });
    rotated(ctx, 710, 1230, 4, () => {
      polaroidFrame(ctx, DUO_B);
      put(ctx, slots, 1, DUO_B);
    });
    if (on(s, "tape")) {
      tapeStrip(ctx, 380, 330, -6, "#e8d9c4");
      tapeStrip(ctx, 720, 880, 5, "#e8d9c4");
    }
    if (on(s, "flowers")) {
      flower(ctx, 600, 330, 70, "#f6e7d8");
      flower(ctx, 470, 905, 64, "#f6e7d8");
      flower(ctx, 980, 1440, 44, "#f6e7d8");
    }
  },
  text: { headline: { rotate: -0.05, lineHeight: 1 }, caption: { rotate: 0.07, lineHeight: 1 } },
};

// ---------------------------------------------------------------------------------------------
const SPLIT_A: Rect = { x: 0, y: 0, w: W, h: 880 };
const SPLIT_B: Rect = { x: 0, y: 1040, w: W, h: 880 };
const splitscreen: Template = {
  id: "splitscreen",
  name: "Split",
  blurb: "Two photos, half and half, with a slim text band between them.",
  overlayLabel: "Band",
  capacity: 2,
  slotRects: () => [SPLIT_A, SPLIT_B],
  decorations: decos([
    ["bars", "Offset bars", true],
    ["dots", "Dots", true],
  ]),
  defaults: (i) => ({
    headline: t({ text: i.headline, size: 54, font: "sans", align: "center", x: 0.5, y: 0.47, width: 0.8, color: "#f4efe6" }),
    caption: t({ text: i.caption || fmtDate(i.date), size: 22, font: "mono", align: "center", x: 0.5, y: 0.512, width: 0.8, color: "#b9b2a8" }),
    overlay: { strength: 1, color: "#1d1d1b" },
    decorations: { bars: true, dots: true },
  }),
  draw(ctx, _p, s, slots) {
    ctx.fillStyle = s.overlay.color;
    ctx.fillRect(0, 0, W, H);
    put(ctx, slots, 0, SPLIT_A);
    put(ctx, slots, 1, SPLIT_B);
    if (on(s, "bars")) {
      ctx.fillStyle = s.overlay.color;
      ctx.fillRect(W - 170, 560, 170, 320);
      ctx.fillRect(0, 1040, 170, 320);
    }
    if (on(s, "dots")) {
      ctx.strokeStyle = "#f4efe6";
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.arc(W - 120, 620 + i * 34, 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(110, 1110 + i * 34, 7, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  },
};

// ---------------------------------------------------------------------------------------------
const BOOTH: Rect[] = [250, 640, 1030].map((y) => ({ x: 350, y, w: 380, h: 360 }));
const booth: Template = {
  id: "booth",
  name: "Photo Booth",
  blurb: "A vertical photo-booth strip of three frames, taped to paper.",
  overlayLabel: "Paper",
  capacity: 3,
  slotRects: () => BOOTH,
  decorations: decos([
    ["tape", "Tape", true],
    ["stars", "Little stars", true],
  ]),
  defaults: (i) => ({
    headline: t({ text: i.headline, size: 46, font: "hand", align: "center", x: 0.5, y: 0.733, width: 0.34 }),
    caption: t({ text: i.caption || fmtDate(i.date), size: 22, font: "mono", align: "center", x: 0.5, y: 0.8, width: 0.6, color: "#69645f" }),
    overlay: { strength: 0.35, color: "#efe8dc" },
    decorations: { tape: true, stars: true },
    filter: "film",
  }),
  draw(ctx, _p, s, slots) {
    ctx.fillStyle = s.overlay.color;
    ctx.fillRect(0, 0, W, H);
    drawGrain(ctx, s.overlay.strength * 0.3, 61);
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.22)";
    ctx.shadowBlur = 24;
    ctx.fillStyle = "#fdfcf8";
    ctx.fillRect(330, 220, 420, 1290);
    ctx.restore();
    BOOTH.forEach((r, i) => put(ctx, slots, i, r));
    if (on(s, "tape")) tapeStrip(ctx, 540, 215, -3, "#d9cbb5", 260);
    if (on(s, "stars")) {
      ctx.fillStyle = "#d9a62e";
      for (const [x, y, r] of [[230, 420, 34], [860, 900, 28], [250, 1210, 22]] as const) {
        star(ctx, x, y, r);
        ctx.fill();
      }
    }
  },
  text: { headline: { lineHeight: 1 } },
};

// ---------------------------------------------------------------------------------------------
const TORN_BANDS: Rect[] = [
  { x: 0, y: 290, w: W, h: 480 },
  { x: 0, y: 760, w: W, h: 480 },
  { x: 0, y: 1230, w: W, h: 440 },
];
function tornBand(ctx: Ctx, r: Rect, seed: number) {
  const rand = rng(seed);
  ctx.beginPath();
  ctx.moveTo(0, r.y);
  for (let x = 0; x <= W; x += 20) ctx.lineTo(x, r.y + (rand() - 0.5) * 30);
  ctx.lineTo(W, r.y + r.h);
  for (let x = W; x >= 0; x -= 20) ctx.lineTo(x, r.y + r.h + (rand() - 0.5) * 30);
  ctx.closePath();
}
const torncollage: Template = {
  id: "torncollage",
  name: "Torn Collage",
  blurb: "Three photos as full-width bands with torn paper edges between them.",
  overlayLabel: "Paper",
  capacity: 3,
  slotRects: () => TORN_BANDS,
  decorations: decos([
    ["labels", "Label tapes", true],
    ["edges", "Paper edges", true],
  ]),
  defaults: (i) => ({
    headline: t({ text: i.headline, size: 30, font: "mono", x: 0.08, y: 0.135, width: 0.8 }),
    caption: t({ text: i.caption || fmtDate(i.date), size: 24, font: "mono", align: "right", x: 0.92, y: 0.79, width: 0.8 }),
    overlay: { strength: 0.3, color: "#ece4d6" },
    decorations: { labels: true, edges: true },
    filter: "film",
  }),
  draw(ctx, _p, s, slots) {
    ctx.fillStyle = s.overlay.color;
    ctx.fillRect(0, 0, W, H);
    drawGrain(ctx, s.overlay.strength * 0.4, 71);
    TORN_BANDS.forEach((r, i) => {
      ctx.save();
      tornBand(ctx, r, 100 + i);
      if (on(s, "edges")) {
        ctx.shadowColor = "rgba(0,0,0,0.3)";
        ctx.shadowBlur = 18;
        ctx.fillStyle = "#f8f3ea";
        ctx.fill();
        ctx.shadowColor = "transparent";
      }
      ctx.clip();
      put(ctx, slots, i, { x: r.x, y: r.y - 20, w: r.w, h: r.h + 40 });
      ctx.restore();
    });
    if (on(s, "labels")) {
      for (const layer of [s.headline, s.caption]) {
        if (!layer.text.trim()) continue;
        ctx.font = fontString("mono", layer.size);
        const w = Math.min(layer.width * W, ctx.measureText(layer.text).width) + 36;
        const x = layer.align === "right" ? layer.x * W - w + 18 : layer.x * W - 18;
        ctx.fillStyle = "#f4ead8";
        ctx.fillRect(x, layer.y * H - 14, w, layer.size * 1.2 + 28);
      }
    }
  },
};

// ---------------------------------------------------------------------------------------------
const GRID: Rect[] = [
  { x: 95, y: 420, w: 425, h: 500 },
  { x: 560, y: 420, w: 425, h: 500 },
  { x: 95, y: 960, w: 425, h: 500 },
  { x: 560, y: 960, w: 425, h: 500 },
];
const grid: Template = {
  id: "grid",
  name: "Grid",
  blurb: "Four photos in a 2×2 film-frame grid on paper, with doodle squiggles.",
  overlayLabel: "Paper",
  capacity: 4,
  slotRects: () => GRID,
  decorations: decos([
    ["frames", "Film frames", true],
    ["squiggles", "Squiggles", true],
    ["flowers", "Flowers", true],
  ]),
  defaults: (i) => ({
    headline: t({ text: i.headline, size: 64, font: "hand", x: 0.09, y: 0.135, width: 0.8 }),
    caption: t({ text: i.caption || fmtDate(i.date), size: 22, font: "mono", align: "right", x: 0.91, y: 0.785, width: 0.8, color: "#69645f" }),
    overlay: { strength: 0.35, color: "#efebe5" },
    decorations: { frames: true, squiggles: true, flowers: true },
  }),
  draw(ctx, _p, s, slots) {
    ctx.fillStyle = s.overlay.color;
    ctx.fillRect(0, 0, W, H);
    drawGrain(ctx, s.overlay.strength * 0.35, 81);
    if (on(s, "flowers")) {
      const rand = rng(8);
      for (let i = 0; i < 9; i++) flower(ctx, rand() * W, 300 + rand() * 1300, 40 + rand() * 30, rgba("#e2874f", 0.75), "#f6d8b8");
    }
    GRID.forEach((r, i) => {
      if (on(s, "frames")) {
        ctx.fillStyle = "#151413";
        ctx.fillRect(r.x - 14, r.y - 14, r.w + 28, r.h + 28);
        ctx.fillStyle = "#e8a33d";
        ctx.font = fontString("mono", 14);
        ctx.fillText(`${i + 1}A  ▸`, r.x + 6, r.y - 2);
      }
      put(ctx, slots, i, r);
    });
    if (on(s, "squiggles")) {
      squiggle(ctx, 90, 375, 260);
      squiggle(ctx, 90, 1525, 260);
    }
  },
};

// ---------------------------------------------------------------------------------------------
const MOSAIC: Rect[] = [
  { x: 90, y: 380, w: 440, h: 700 },
  { x: 550, y: 380, w: 440, h: 420 },
  { x: 550, y: 820, w: 440, h: 700 },
  { x: 90, y: 1100, w: 440, h: 420 },
];
const mosaic: Template = {
  id: "mosaic",
  name: "Mosaic",
  blurb: "An asymmetric mosaic of tall and small tiles on linen.",
  overlayLabel: "Linen",
  capacity: 4,
  slotRects: () => MOSAIC,
  decorations: decos([["rule", "Title rule", true]]),
  defaults: (i) => ({
    headline: t({ text: i.headline, size: 54, font: "italic", x: 0.083, y: 0.13, width: 0.84 }),
    caption: t({ text: i.caption || fmtDate(i.date), size: 20, font: "mono", align: "right", x: 0.917, y: 0.802, width: 0.84, color: "#69645f" }),
    overlay: { strength: 0.3, color: "#e9e1d6" },
    decorations: { rule: true },
    filter: "faded",
  }),
  draw(ctx, _p, s, slots) {
    ctx.fillStyle = s.overlay.color;
    ctx.fillRect(0, 0, W, H);
    drawGrain(ctx, s.overlay.strength * 0.35, 91);
    if (on(s, "rule")) {
      ctx.fillStyle = "#1d1d1b";
      ctx.fillRect(90, 345, 900, 2);
    }
    MOSAIC.forEach((r, i) => put(ctx, slots, i, r, 6));
  },
};

// ---------------------------------------------------------------------------------------------
const PILE: { r: Rect; rot: number; label: string }[] = [
  { r: { x: 140, y: 360, w: 360, h: 360 }, rot: -6, label: "sweet" },
  { r: { x: 580, y: 420, w: 360, h: 360 }, rot: 5, label: "memories" },
  { r: { x: 170, y: 920, w: 360, h: 360 }, rot: 4, label: "us" },
  { r: { x: 580, y: 980, w: 360, h: 360 }, rot: -4, label: "again" },
];
const polaroids: Template = {
  id: "polaroids",
  name: "Polaroid Pile",
  blurb: "A pile of tilted polaroids with tape and handwritten labels on a dark backdrop.",
  overlayLabel: "Backdrop tint",
  capacity: 4,
  slotRects: (_s, count) => PILE.slice(0, count > 1 ? Math.min(4, count) : 3).map((p) => p.r),
  decorations: decos([
    ["tape", "Tape", true],
    ["labels", "Handwritten labels", true],
  ]),
  defaults: (i) => ({
    headline: t({ text: i.headline, size: 62, font: "hand", align: "center", x: 0.5, y: 0.765, width: 0.84, color: "#f4efe6" }),
    caption: t({ text: fmtDate(i.date), size: 22, font: "mono", x: 0.08, y: 0.135, width: 0.7, color: "#d8d2c8" }),
    overlay: { strength: 0.62, color: "#0d0c0b" },
    decorations: { tape: true, labels: true },
  }),
  draw(ctx, _p, s, slots) {
    drawBlurred(ctx, slots.photo(0), { x: 0, y: 0, w: W, h: H }, slots.crop(0));
    ctx.fillStyle = rgba(s.overlay.color, s.overlay.strength);
    ctx.fillRect(0, 0, W, H);
    const n = slots.count > 1 ? Math.min(4, slots.count) : 3;
    PILE.slice(0, n).forEach(({ r, rot, label }, i) => {
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2 + 40;
      rotated(ctx, cx, cy, rot, () => {
        polaroidFrame(ctx, r, 96, 20);
        put(ctx, slots, i, r);
        if (on(s, "labels")) {
          ctx.fillStyle = "#3a3530";
          ctx.font = fontString("hand", 38);
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(label, cx, r.y + r.h + 46);
          ctx.textAlign = "left";
        }
      });
      if (on(s, "tape")) tapeStrip(ctx, cx, r.y - 18, rot * 1.5, "#d8d2c8", 160);
    });
  },
  text: { headline: { shadow: true, lineHeight: 1 } },
};

export const MULTI_TEMPLATES: Record<
  Extract<TemplateId, "duo" | "splitscreen" | "booth" | "torncollage" | "grid" | "mosaic" | "polaroids">,
  Template
> = { duo, splitscreen, booth, torncollage, grid, mosaic, polaroids };
