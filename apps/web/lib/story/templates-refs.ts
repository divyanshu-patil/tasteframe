// Layouts recreated from the owner's reference set (design-refs/pinterest/user1, u01–u19).
// Brand UIs in the refs (streaming apps, camera makers, magazines) are reduced to generic
// shapes; text comes from the Story, never invented track names.
import { drawCutout } from "./cutout";
import { type Ctx, type Photo, drawGrain, drawPhoto, fontString, rgba, rng, roundRect } from "./draw";
import { drawElement } from "./elements";
import { filteredPhoto } from "./filters";
import { type Slots, type Template, decos, fmtDate, on, pad, t } from "./kit";
import { drawSticker } from "./stickers";
import type { Crop, Rect, StoryState, TemplateId, TemplateInput } from "./types";
import { STORY_H as H, STORY_W as W } from "./types";

const FULL: Rect = { x: 0, y: 0, w: W, h: H };
const WHITE = "#ffffff";
const INK = "#1d1d1b";

/** Where a photo-space point (0..1) lands when the photo is cover-drawn into r with crop. */
function photoPoint(photo: Photo, r: Rect, crop: Crop, fx: number, fy: number) {
  const scale = Math.max(r.w / photo.width, r.h / photo.height) * Math.max(1, crop.zoom);
  const w = photo.width * scale;
  const h = photo.height * scale;
  const x0 = r.x + (r.w - w) * Math.min(1, Math.max(0, crop.x));
  const y0 = r.y + (r.h - h) * Math.min(1, Math.max(0, crop.y));
  return { x: x0 + fx * w, y: y0 + fy * h, w };
}

/** The subject (face) point on the Story for a full-bleed photo 1. */
function face(s: StoryState, slots: Slots, r: Rect = FULL) {
  const f = s.focus ?? { x: 0.5, y: 0.42 };
  const p = photoPoint(slots.photo(0), r, slots.crop(0), f.x, f.y);
  return { x: Math.min(r.x + r.w - 60, Math.max(r.x + 60, p.x)), y: Math.min(r.y + r.h - 60, Math.max(r.y + 60, p.y)), w: p.w };
}

/** Eye-level band default: with the subject crop, photo-y f lands at Story-y f. */
const eyeBand = (i: TemplateInput, x: number, w: number, h: number): Rect => {
  const fy = (i.focuses?.[0] ?? i.focus)?.y ?? 0.4;
  return { x, y: Math.min(0.75, Math.max(0.12, fy - 0.03 - h / 2)), w, h };
};

const SHIFT = [
  { x: 0, y: 0, z: 1 },
  { x: 0.06, y: -0.04, z: 1.12 },
  { x: -0.06, y: 0.05, z: 1.22 },
  { x: 0.04, y: 0.08, z: 1.35 },
];
/** Slot i (own photo, or a gently shifted crop of photo 1) into r, clipped. */
function slotPhoto(ctx: Ctx, slots: Slots, i: number, r: Rect, radius = 0, photoOverride?: (p: Photo) => Photo) {
  ctx.save();
  if (radius) roundRect(ctx, r, radius);
  else {
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
  }
  ctx.clip();
  const own = slots.own(i);
  const base = slots.crop(own ? i : 0);
  const sh = own ? SHIFT[0]! : SHIFT[i % SHIFT.length]!;
  const src = slots.photo(own ? i : 0);
  drawPhoto(ctx, photoOverride ? photoOverride(src) : src, r, {
    ...base,
    zoom: base.zoom * sh.z,
    x: Math.min(1, Math.max(0, base.x + sh.x)),
    y: Math.min(1, Math.max(0, base.y + sh.y)),
  });
  ctx.restore();
}

function rot(ctx: Ctx, cx: number, cy: number, deg: number, fn: () => void) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.translate(-cx, -cy);
  fn();
  ctx.restore();
}

function element(ctx: Ctx, kind: Parameters<typeof drawElement>[1], x: number, y: number, size: number, deg = 0) {
  ctx.save();
  ctx.translate(x, y);
  if (deg) ctx.rotate((deg * Math.PI) / 180);
  drawElement(ctx, kind, size);
  ctx.restore();
}

function label(ctx: Ctx, text: string, x: number, y: number, size: number, color: string, font: Parameters<typeof fontString>[0] = "mono", align: CanvasTextAlign = "left") {
  ctx.save();
  ctx.font = fontString(font, size);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  text.split("\n").forEach((l, i) => ctx.fillText(l, x, y + i * size * 1.25));
  ctx.restore();
}

function bar(ctx: Ctx, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  roundRect(ctx, { x, y, w, h }, h / 2);
  ctx.fill();
}

const songTitle = (s: StoryState) => s.cover?.title || "";
const songArtist = (s: StoryState) => s.cover?.artist || "";
const timeFrom = (s: StoryState) => {
  const n = Number(s.stamp.replace(/\D/g, "")) || 0;
  return `${pad(10 + (n % 13))}:${pad((n * 7) % 60)}`;
};

// ---- u01 Playlist: a dark library panel over two stacked photos -------------------------
const playlist: Template = {
  id: "playlist",
  name: "Playlist",
  blurb: "A dark music-library panel up top, two photos stacked below.",
  overlayLabel: "Panel",
  capacity: 2,
  decorations: decos([["hearts", "Hearts", true]]),
  slotRects: () => [
    { x: 0, y: 700, w: W, h: 610 },
    { x: 0, y: 1310, w: W, h: 610 },
  ],
  defaults: (i) => ({
    headline: t({ text: i.headline, font: "sans", size: 44, color: WHITE, x: 0.08, y: 0.15, width: 0.84 }),
    caption: t({ text: i.caption || fmtDate(i.date), font: "mono", size: 22, color: WHITE, x: 0.08, y: 0.78 }),
    overlay: { strength: 1, color: "#121212" },
    decorations: { hearts: true },
  }),
  draw(ctx, _p, s, slots) {
    slotPhoto(ctx, slots, 0, { x: 0, y: 700, w: W, h: 610 });
    slotPhoto(ctx, slots, 1, { x: 0, y: 1310, w: W, h: 610 });
    ctx.fillStyle = s.overlay.color;
    ctx.fillRect(0, 0, W, 700);
    label(ctx, "#     title", 86, 380, 20, "#8a8a8a");
    ctx.fillStyle = "#2a2a2a";
    ctx.fillRect(86, 412, W - 172, 2);
    for (let r = 0; r < 4; r++) {
      const y = 432 + r * 64;
      label(ctx, String(r + 1), 86, y + 16, 22, "#8a8a8a");
      slotPhoto(ctx, slots, r % Math.max(1, slots.count), { x: 130, y, w: 52, h: 52 }, 4);
      if (r === 0 && songTitle(s)) {
        label(ctx, songTitle(s), 204, y + 2, 24, WHITE, "sans");
        label(ctx, songArtist(s), 204, y + 30, 18, "#9a9a9a", "sans");
      } else {
        // No invented track names: neutral placeholders.
        bar(ctx, 204, y + 10, 220 + ((r * 97) % 160), 14, "#3a3a3a");
        bar(ctx, 204, y + 34, 120 + ((r * 53) % 90), 10, "#2c2c2c");
      }
    }
    ctx.fillStyle = s.accent;
    ctx.beginPath();
    ctx.arc(W - 120, 300, 42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#121212";
    ctx.beginPath();
    ctx.moveTo(W - 132, 280);
    ctx.lineTo(W - 104, 300);
    ctx.lineTo(W - 132, 320);
    ctx.fill();
    if (on(s, "hearts")) {
      drawSticker(ctx, { id: "h1", kind: "heart", x: 0.3, y: 0.84, scale: 0.35, rotate: 350, color: "#ff8a3d" });
      drawSticker(ctx, { id: "h2", kind: "heart", x: 0.2, y: 0.93, scale: 0.4, rotate: 10, color: "#ff3d8b" });
    }
  },
  text: { caption: { shadow: true } },
};

// ---- u02 Player Cutout: die-cut person over collage paper on a player card ---------------
const playercut: Template = {
  id: "playercut",
  name: "Player Cutout",
  blurb: "You cut out over a collage, on a deep-red music player card.",
  overlayLabel: "Card",
  needsMask: true,
  decorations: decos([["controls", "Player controls", true]]),
  defaults: (i) => ({
    headline: t({ text: i.music?.title || i.headline, font: "sans", size: 46, color: WHITE, x: 0.12, y: 0.62, width: 0.76 }),
    caption: t({ text: i.music?.artist || i.caption || fmtDate(i.date), font: "serif", size: 32, color: "#e8a0a8", x: 0.12, y: 0.66, width: 0.76 }),
    overlay: { strength: 1, color: "#6b1a1a" },
    decorations: { controls: true },
    filter: "bw",
  }),
  slotRects: () => [{ x: 90, y: 260, w: 900, h: 820 }],
  draw(ctx, _p, s, slots) {
    ctx.fillStyle = "#3d0d0d";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = s.overlay.color;
    roundRect(ctx, { x: 50, y: 170, w: W - 100, h: 1560 }, 70);
    ctx.fill();
    drawGrain(ctx, 0.08, 9);
    // Collage paper: a pale, zoomed sepia copy of the photo.
    const paper = { x: 110, y: 300, w: 860, h: 760 };
    ctx.save();
    ctx.globalAlpha = 0.7;
    slotPhoto(ctx, slots, 0, paper, 0, (p) => filteredPhoto(p, "faded"));
    ctx.restore();
    ctx.fillStyle = "rgba(240,225,200,0.35)";
    ctx.fillRect(paper.x, paper.y, paper.w, paper.h);
    const cut = { x: 60, y: 200, w: 960, h: 960 };
    const ok = drawCutout(ctx, slots.photo(0), slots.mask(0), cut, slots.crop(0), { color: WHITE, width: 7 });
    if (!ok) slotPhoto(ctx, slots, 0, paper);
    label(ctx, "now playing", 130, 1150, 22, "#e8a0a8");
    if (!on(s, "controls")) return;
    const y = 1390;
    bar(ctx, 130, y, W - 260, 8, "rgba(232,160,168,0.35)");
    bar(ctx, 130, y, (W - 260) * 0.48, 8, "#e8a0a8");
    label(ctx, "1:24", 130, y + 24, 20, "#e8a0a8");
    label(ctx, "-2:31", W - 130, y + 24, 20, "#e8a0a8", "mono", "right");
    ctx.fillStyle = WHITE;
    const cy = 1530;
    for (const dir of [-1, 1] as const) {
      for (const off of [0, 30]) {
        const x = W / 2 + dir * (200 - off);
        ctx.beginPath();
        ctx.moveTo(x, cy - 22);
        ctx.lineTo(x + dir * 30, cy);
        ctx.lineTo(x, cy + 22);
        ctx.fill();
      }
    }
    ctx.fillRect(W / 2 - 26, cy - 30, 16, 60);
    ctx.fillRect(W / 2 + 10, cy - 30, 16, 60);
    bar(ctx, 200, 1640, W - 400, 6, "rgba(232,160,168,0.35)");
    bar(ctx, 200, 1640, (W - 400) * 0.6, 6, "#e8a0a8");
  },
};

// ---- u03 Triptych: the same moment three times, faded ------------------------------------
const triptych: Template = {
  id: "triptych",
  name: "Triptych",
  blurb: "Three stacked frames of the moment, softly faded.",
  overlayLabel: "Gap",
  capacity: 3,
  decorations: decos([["grain", "Grain", true]]),
  slotRects: () => [0, 1, 2].map((i) => ({ x: 0, y: i * 640, w: W, h: 636 })),
  defaults: (i) => ({
    headline: t({ text: i.headline, font: "italic", size: 46, color: WHITE, x: 0.08, y: 0.6, width: 0.6 }),
    caption: t({ text: i.caption || fmtDate(i.date), font: "mono", size: 20, color: WHITE, x: 0.08, y: 0.79 }),
    overlay: { strength: 1, color: "#1a1714" },
    decorations: { grain: true },
    filter: "faded",
  }),
  draw(ctx, _p, s, slots) {
    ctx.fillStyle = s.overlay.color;
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 3; i++) slotPhoto(ctx, slots, i, { x: 0, y: i * 640, w: W, h: 636 });
    if (on(s, "grain")) drawGrain(ctx, 0.1, 31);
  },
  text: { headline: { shadow: true }, caption: { shadow: true } },
};

// ---- u04 CCTV: surveillance HUD with face box and zoom callouts --------------------------
const RED = "#b83333";
const cctv: Template = {
  id: "cctv",
  name: "CCTV",
  blurb: "Surveillance-cam frame: timestamp, red tracking boxes and zoomed callouts.",
  overlayLabel: "Photo tint",
  decorations: decos([["icons", "Folder & warning icons", true], ["callouts", "Zoom callouts", true]]),
  defaults: (i) => ({
    headline: t({ text: i.headline.toUpperCase(), font: "mono", size: 40, color: WHITE, x: 0.08, y: 0.09, width: 0.6 }),
    caption: t({ text: `DATA UPDATE\n${(i.caption || fmtDate(i.date)).toUpperCase()}`, font: "mono", size: 24, color: WHITE, x: 0.08, y: 0.78, width: 0.5 }),
    overlay: { strength: 0.12, color: "#000000" },
    decorations: { icons: true, callouts: true },
    filter: "faded",
  }),
  draw(ctx, _p, s, slots) {
    drawPhoto(ctx, slots.photo(0), FULL, slots.crop(0));
    ctx.fillStyle = rgba(s.overlay.color, s.overlay.strength);
    ctx.fillRect(0, 0, W, H);
    drawGrain(ctx, 0.12, 4);
    ctx.strokeStyle = WHITE;
    ctx.lineWidth = 5;
    ctx.strokeRect(40, 40, W - 80, H - 80);
    label(ctx, "CCTV 01", 86, 90, 44, WHITE);
    label(ctx, `${timeFrom(s)}:49`, W - 86, 90, 44, WHITE, "mono", "right");
    label(ctx, "SCENE 05/20", W - 86, 150, 34, WHITE, "mono", "right");
    label(ctx, "DESIGN BY\nYOU", W - 86, 1490, 24, WHITE, "mono", "right");
    const f = face(s, slots);
    const bw = Math.max(240, Math.min(380, f.w * 0.26));
    const box = { x: f.x - bw / 2, y: f.y - bw * 0.62, w: bw, h: bw * 1.15 };
    ctx.strokeStyle = RED;
    ctx.lineWidth = 5;
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    ctx.fillStyle = RED;
    ctx.fillRect(box.x + box.w - 140, box.y - 40, 140, 40);
    label(ctx, "SUBJECT", box.x + box.w - 70, box.y - 34, 24, WHITE, "mono", "center");
    if (on(s, "callouts")) {
      const bw2 = filteredPhoto(slots.photo(0), "bw");
      const ins = { x: f.x < W / 2 ? W - 400 : 90, y: Math.min(1180, box.y + box.h + 120), w: 310, h: 310 };
      ctx.beginPath();
      ctx.moveTo(box.x + (ins.x > f.x ? box.w : 0), box.y + box.h);
      ctx.lineTo(ins.x + (ins.x > f.x ? 0 : ins.w), ins.y);
      ctx.stroke();
      ctx.save();
      ctx.beginPath();
      ctx.rect(ins.x, ins.y, ins.w, ins.h);
      ctx.clip();
      const c = slots.crop(0);
      drawPhoto(ctx, bw2, ins, { ...c, zoom: c.zoom * 2.4, x: s.focus?.x ?? 0.5, y: s.focus?.y ?? 0.4 });
      ctx.restore();
      ctx.strokeRect(ins.x, ins.y, ins.w, ins.h);
      label(ctx, `#${s.accent.replace("#", "").toUpperCase()}`, ins.x, ins.y - 32, 22, WHITE);
      // A second box lower down (hands / detail).
      const d = { x: f.x - bw * 0.4, y: Math.min(1450, box.y + box.h + bw * 1.1), w: bw * 0.8, h: bw * 0.7 };
      ctx.strokeRect(d.x, d.y, d.w, d.h);
      ctx.fillRect(d.x, d.y - 36, 110, 36);
      label(ctx, "DETAIL", d.x + 55, d.y - 31, 20, WHITE, "mono", "center");
    }
    if (on(s, "icons")) {
      element(ctx, "folder", 150, 980, 120, -6);
      element(ctx, "folder", 210, 1140, 80, 4);
      element(ctx, "warning", W - 170, 560, 110);
      element(ctx, "cursor", box.x + box.w * 0.6, box.y + box.h * 0.75, 110);
    }
  },
};

// ---- u05 Colour Box: B&W photo with a draggable colour window ----------------------------
const MAROON = "#6e1420";
const colorbox: Template = {
  id: "colorbox",
  name: "Colour Box",
  blurb: "Black-and-white photo with a box where the colour shows through — drag it anywhere.",
  overlayLabel: "Accent",
  needsMask: true,
  decorations: decos([["tag", "Style tag", true]]),
  spot: (i) => {
    const f = i.focuses?.[0] ?? i.focus ?? { x: 0.5, y: 0.42 };
    return { x: Math.min(0.5, Math.max(0.06, f.x - 0.3)), y: Math.min(0.62, Math.max(0.3, f.y + 0.06)), w: 0.6, h: 0.3 };
  },
  defaults: (i) => ({
    headline: t({ text: i.headline.toUpperCase(), font: "display", size: 170, color: MAROON, x: 0.5, y: 0.13, width: 1, align: "center" }),
    caption: t({ text: (i.caption || "all eyes on me").toUpperCase(), font: "sans", size: 74, color: MAROON, x: 0.94, y: 0.66, width: 0.42, align: "right" }),
    overlay: { strength: 1, color: MAROON },
    decorations: { tag: true },
  }),
  draw(ctx, _p, s, slots) {
    drawPhoto(ctx, filteredPhoto(slots.photo(0), "bw"), FULL, slots.crop(0));
    ctx.fillStyle = "rgba(235,235,235,0.18)";
    ctx.fillRect(0, 0, W, H);
  },
  front(ctx, s, slots) {
    // The person in front of the big title, then the colour window.
    drawCutout(ctx, filteredPhoto(slots.photo(0), "bw"), slots.mask(0), FULL, slots.crop(0));
    const sp = s.spot ?? { x: 0.2, y: 0.4, w: 0.6, h: 0.3 };
    const r = { x: sp.x * W, y: sp.y * H, w: sp.w * W, h: sp.h * H };
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    drawPhoto(ctx, slots.photo(0), FULL, slots.crop(0));
    ctx.restore();
    ctx.strokeStyle = s.overlay.color;
    ctx.lineWidth = 6;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    if (on(s, "tag")) {
      ctx.fillStyle = s.overlay.color;
      ctx.fillRect(W - 360, r.y + 20, 360, 110);
      label(ctx, (s.tags?.[0] || "style").toUpperCase(), W - 180, r.y + 46, 52, WHITE, "sans", "center");
    }
  },
  text: { headline: { lineHeight: 0.85, tracking: 0.02 } },
};

// ---- u06 Torn Strip: magazine cover torn open across the eyes -----------------------------
function tornBand(ctx: Ctx, y: number, seed: number, dir: 1 | -1) {
  const rand = rng(seed);
  ctx.fillStyle = "#f8f6f0";
  ctx.beginPath();
  ctx.moveTo(-10, y);
  for (let x = -10; x <= W + 10; x += 16) ctx.lineTo(x, y + dir * (18 + rand() * 26));
  ctx.lineTo(W + 10, y - dir * 6);
  ctx.lineTo(-10, y - dir * 6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  for (let x = 0; x < W; x += 11) ctx.fillRect(x, y + dir * (20 + rand() * 24), 2, dir * (4 + rand() * 6));
}
const tornstrip: Template = {
  id: "tornstrip",
  name: "Torn Strip",
  blurb: "Magazine-cover look, torn open across the eyes to a black-and-white layer.",
  overlayLabel: "Cover colour",
  decorations: decos([["ghost", "Ghost masthead", true]]),
  spot: (i) => eyeBand(i, 0, 1, 0.135),
  defaults: (i) => ({
    headline: t({ text: i.headline.toUpperCase(), font: "display", size: 150, color: INK, x: 0.5, y: 0.04, width: 0.96, align: "center" }),
    caption: t({ text: i.caption || fmtDate(i.date), font: "italic", size: 30, color: "#c0392b", x: 0.92, y: 0.72, width: 0.32, align: "right" }),
    overlay: { strength: 0.35, color: "#8e1b1b" },
    decorations: { ghost: true },
  }),
  draw(ctx, _p, s, slots) {
    drawPhoto(ctx, slots.photo(0), FULL, slots.crop(0));
    ctx.fillStyle = rgba(s.overlay.color, s.overlay.strength);
    ctx.globalCompositeOperation = "multiply";
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";
    const band = s.spot ?? { x: 0, y: 0.18, w: 1, h: 0.135 };
    const top = band.y * H;
    const bot = top + band.h * H;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top, W, bot - top);
    ctx.clip();
    const c = slots.crop(0);
    drawPhoto(ctx, filteredPhoto(slots.photo(0), "bw"), FULL, c);
    if (on(s, "ghost")) {
      ctx.globalAlpha = 0.35;
      label(ctx, s.headline.text.toUpperCase(), W / 2, top + 20, 220, INK, "display", "center");
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    tornBand(ctx, top, 11, 1);
    tornBand(ctx, bot, 23, -1);
  },
  text: { headline: { tracking: 0.08 } },
};

// ---- u07 Sticker Cutout: you as a die-cut sticker over huge words ------------------------
const cutout: Template = {
  id: "cutout",
  name: "Sticker Cutout",
  blurb: "You as a die-cut sticker with a white outline, standing over huge words.",
  overlayLabel: "Photo tint",
  needsMask: true,
  decorations: decos([["doodles", "Cat & heart doodles", true]]),
  defaults: (i) => ({
    headline: t({ text: i.headline.toUpperCase(), font: "sans", size: 210, color: WHITE, x: 0.5, y: 0.14, width: 0.95, align: "center" }),
    caption: t({ text: i.caption || fmtDate(i.date), font: "mono", size: 22, color: WHITE, x: 0.08, y: 0.79 }),
    overlay: { strength: 0.1, color: "#000000" },
    decorations: { doodles: true },
  }),
  draw(ctx, _p, s, slots) {
    drawPhoto(ctx, slots.photo(0), FULL, slots.crop(0));
    ctx.fillStyle = rgba(s.overlay.color, s.overlay.strength);
    ctx.fillRect(0, 0, W, H);
  },
  front(ctx, s, slots) {
    drawCutout(ctx, slots.photo(0), slots.mask(0), FULL, slots.crop(0), { color: WHITE, width: 16 });
    if (!on(s, "doodles")) return;
    const f = face(s, slots);
    element(ctx, "faceheart", f.x + f.w * 0.06, f.y + f.w * 0.05, 46);
    element(ctx, "cat", 220, 1520, 170);
  },
  text: { headline: { lineHeight: 0.84, tracking: -0.04 }, caption: { shadow: true } },
};

// ---- u08 Focus: blurred B&W with a sharp colour strip over the eyes ----------------------
const focus: Template = {
  id: "focus",
  name: "Focus",
  blurb: "Soft black-and-white blur with one sharp strip across the eyes.",
  overlayLabel: "Blur tint",
  decorations: decos([["barcode", "Barcode & date", true]]),
  spot: (i) => eyeBand(i, 0.1, 0.86, 0.156),
  defaults: (i) => ({
    headline: t({ text: i.headline.toUpperCase(), font: "sans", size: 130, color: WHITE, x: 0.5, y: 0.04, width: 0.96, align: "center" }),
    caption: t({ text: i.caption || "always in the eyes", font: "sans", size: 40, color: WHITE, x: 0.05, y: 0.44, width: 0.5 }),
    overlay: { strength: 0.08, color: "#ffffff" },
    decorations: { barcode: true },
  }),
  draw(ctx, _p, s, slots) {
    const bw = filteredPhoto(slots.photo(0), "bw");
    ctx.save();
    ctx.filter = "blur(14px)";
    drawPhoto(ctx, bw, { x: -30, y: -30, w: W + 60, h: H + 60 }, slots.crop(0));
    ctx.restore();
    ctx.fillStyle = rgba(s.overlay.color, s.overlay.strength);
    ctx.fillRect(0, 0, W, H);
    const band = s.spot ?? { x: 0.1, y: 0.2, w: 0.86, h: 0.156 };
    const r = { x: band.x * W, y: band.y * H, w: band.w * W, h: band.h * H };
    ctx.save();
    roundRect(ctx, r, 10);
    ctx.clip();
    drawPhoto(ctx, slots.photo(0), { x: -30, y: -30, w: W + 60, h: H + 60 }, slots.crop(0));
    ctx.restore();
    ctx.strokeStyle = WHITE;
    ctx.lineWidth = 4;
    roundRect(ctx, r, 10);
    ctx.stroke();
    if (on(s, "barcode")) {
      const d = new Date(2000 + Number(s.stamp.slice(1, 3)), Number(s.stamp.slice(4, 6)) - 1, Number(s.stamp.slice(7, 9)));
      label(ctx, `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`, 60, 1500, 34, WHITE, "sans");
      element(ctx, "barcode", W - 170, 1520, 260);
    }
  },
  text: { headline: { outline: 3, tracking: 0.08 }, caption: { rotate: -Math.PI / 2 } },
};

// ---- u09 Camera LCD: the photo on a camera's back screen ---------------------------------
const viewfinder: Template = {
  id: "viewfinder",
  name: "Camera Screen",
  blurb: "Your photo on a camera's back screen, with focus brackets and REC.",
  overlayLabel: "Body",
  decorations: decos([["hud", "Screen HUD", true]]),
  slotRects: () => [{ x: 130, y: 330, w: 820, h: 1120 }],
  defaults: (i) => ({
    headline: t({ text: i.headline, font: "sans", size: 40, color: WHITE, x: 0.12, y: 0.79, width: 0.76 }),
    caption: t({ text: i.caption || fmtDate(i.date), font: "mono", size: 20, color: "#9a9a9a", x: 0.12, y: 0.12 }),
    overlay: { strength: 1, color: "#151515" },
    decorations: { hud: true },
    filter: "cool",
  }),
  draw(ctx, _p, s, slots) {
    ctx.fillStyle = s.overlay.color;
    ctx.fillRect(0, 0, W, H);
    drawGrain(ctx, 0.06, 12);
    for (const [x, y, r, txt] of [[60, 600, 46, "MENU"], [60, 1500, 46, "C3"], [1020, 1500, 40, "▶"]] as const) {
      ctx.fillStyle = "#262626";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      label(ctx, txt, x, y - 10, 18, "#bdbdbd", "sans", "center");
    }
    ctx.fillStyle = "#050505";
    roundRect(ctx, { x: 110, y: 310, w: 860, h: 1160 }, 16);
    ctx.fill();
    const scr = { x: 130, y: 330, w: 820, h: 1120 };
    slotPhoto(ctx, slots, 0, scr, 6);
    ctx.fillStyle = "rgba(220,255,235,0.12)";
    ctx.fillRect(scr.x, scr.y, scr.w, scr.h);
    if (!on(s, "hud")) return;
    const f = face(s, slots, scr);
    element(ctx, "brackets", f.x, f.y, Math.max(200, Math.min(320, f.w * 0.3)));
    element(ctx, "rec", scr.x + scr.w - 110, scr.y + 50, 140);
    label(ctx, "ISO 400   1/125   F2.8   AWB", scr.x + 30, scr.y + scr.h - 50, 20, "#7dffb0");
    label(ctx, "4K", scr.x + 30, scr.y + 30, 22, "#7dffb0");
  },
};

// ---- u10 Camcorder: full-frame viewfinder HUD ---------------------------------------------
const camcorder: Template = {
  id: "camcorder",
  name: "Camcorder",
  blurb: "Full-frame camcorder viewfinder: REC dot, timer and green focus brackets on the face.",
  overlayLabel: "Frame",
  decorations: decos([["hud", "Viewfinder HUD", true]]),
  defaults: (i) => ({
    headline: t({ text: i.headline, font: "mono", size: 30, color: WHITE, x: 0.08, y: 0.76, width: 0.84 }),
    caption: t({ text: i.caption || fmtDate(i.date), font: "mono", size: 20, color: WHITE, x: 0.08, y: 0.8 }),
    overlay: { strength: 1, color: "#000000" },
    decorations: { hud: true },
    filter: "faded",
  }),
  draw(ctx, _p, s, slots) {
    drawPhoto(ctx, slots.photo(0), FULL, slots.crop(0));
    ctx.strokeStyle = s.overlay.color;
    ctx.lineWidth = 36;
    ctx.strokeRect(0, 0, W, H);
    if (!on(s, "hud")) return;
    const f = face(s, slots);
    element(ctx, "brackets", f.x, f.y, Math.max(220, Math.min(340, f.w * 0.3)));
    label(ctx, "AF    ISO 200    1/60    ▮▮▮", 70, 290, 22, WHITE);
    element(ctx, "rec", W - 150, 305, 150);
    label(ctx, `00:${timeFrom(s)}`, 70, 1600, 26, WHITE);
  },
  text: { headline: { shadow: true }, caption: { shadow: true } },
};

// ---- u13 Sepia Booth: four tilted sepia prints ---------------------------------------------
const PRINTS: (Rect & { r: number })[] = [
  { x: 30, y: 40, w: 510, h: 900, r: -1.2 },
  { x: 555, y: 20, w: 500, h: 920, r: 1.1 },
  { x: 25, y: 975, w: 515, h: 905, r: 0.8 },
  { x: 560, y: 960, w: 500, h: 930, r: -0.9 },
];
const sepiabooth: Template = {
  id: "sepiabooth",
  name: "Sepia Prints",
  blurb: "Four slightly tilted sepia prints laid edge to edge.",
  overlayLabel: "Paper",
  capacity: 4,
  decorations: decos([["grain", "Grain", true]]),
  slotRects: () => PRINTS.map(({ x, y, w, h }) => ({ x, y, w, h })),
  defaults: (i) => ({
    headline: t({ text: i.headline, font: "italic", size: 44, color: WHITE, x: 0.08, y: 0.45, width: 0.84 }),
    caption: t({ text: i.caption || fmtDate(i.date), font: "mono", size: 20, color: WHITE, x: 0.08, y: 0.8 }),
    overlay: { strength: 1, color: "#d9d0c1" },
    decorations: { grain: true },
    filter: "sepia",
  }),
  draw(ctx, _p, s, slots) {
    ctx.fillStyle = s.overlay.color;
    ctx.fillRect(0, 0, W, H);
    PRINTS.forEach((p, i) =>
      rot(ctx, p.x + p.w / 2, p.y + p.h / 2, p.r, () => {
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.3)";
        ctx.shadowBlur = 16;
        ctx.fillStyle = "#e8e0d2";
        ctx.fillRect(p.x - 6, p.y - 6, p.w + 12, p.h + 12);
        ctx.restore();
        slotPhoto(ctx, slots, i, p);
      }),
    );
    if (on(s, "grain")) drawGrain(ctx, 0.12, 21);
  },
  text: { headline: { shadow: true }, caption: { shadow: true } },
};

// ---- u14 Desktop: the photo in a window on a laptop screen at night ----------------------
const desktop: Template = {
  id: "desktop",
  name: "Desktop",
  blurb: "Your photo in a window on a glowing laptop screen, late at night.",
  overlayLabel: "Room",
  decorations: decos([["dock", "Dock", true]]),
  slotRects: () => [{ x: 400, y: 420, w: 640, h: 620 }],
  defaults: (i) => ({
    headline: t({ text: i.headline, font: "sans", size: 46, color: WHITE, x: 0.08, y: 0.77, width: 0.84 }),
    caption: t({ text: i.caption || fmtDate(i.date), font: "mono", size: 20, color: "#9a9a9a", x: 0.08, y: 0.81 }),
    overlay: { strength: 1, color: "#09090b" },
    decorations: { dock: true },
  }),
  draw(ctx, _p, s, slots) {
    ctx.fillStyle = s.overlay.color;
    ctx.fillRect(0, 0, W, H);
    rot(ctx, W / 2, 800, -4, () => {
      ctx.fillStyle = "#121216";
      roundRect(ctx, { x: 40, y: 230, w: 1120, h: 1180 }, 24);
      ctx.fill();
      label(ctx, "●  File   Edit   View   Camera   Window   Help", 80, 262, 22, "#d0d0d0", "sans");
      label(ctx, "Library", 80, 380, 30, WHITE, "sans");
      for (let r = 0; r < 7; r++) {
        const y = 450 + r * 110;
        slotPhoto(ctx, slots, 0, { x: 80, y, w: 80, h: 80 }, 10);
        if (r === 0 && songTitle(s)) {
          label(ctx, songTitle(s), 180, y + 8, 24, WHITE, "sans");
          label(ctx, songArtist(s), 180, y + 42, 18, "#8a8a8a", "sans");
        } else {
          bar(ctx, 180, y + 16, 140 + ((r * 41) % 80), 14, "#2f2f35");
          bar(ctx, 180, y + 46, 90 + ((r * 29) % 60), 10, "#26262b");
        }
      }
      ctx.fillStyle = "#1c1c20";
      roundRect(ctx, { x: 380, y: 370, w: 680, h: 760 }, 14);
      ctx.fill();
      ["#ff5f57", "#febc2e", "#28c840"].forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(410 + i * 30, 395, 9, 0, Math.PI * 2);
        ctx.fill();
      });
      slotPhoto(ctx, slots, 0, { x: 400, y: 420, w: 640, h: 620 });
      ctx.fillStyle = "#e0453a";
      ctx.beginPath();
      ctx.arc(720, 1085, 30, 0, Math.PI * 2);
      ctx.fill();
      if (on(s, "dock")) {
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        roundRect(ctx, { x: 140, y: 1300, w: 900, h: 96 }, 24);
        ctx.fill();
        const cols = ["#4a90e2", "#f5a623", "#7ed321", "#bd10e0", "#50e3c2", "#e94e77", "#f8e71c", "#9013fe"];
        cols.forEach((c, i) => {
          ctx.fillStyle = c;
          roundRect(ctx, { x: 170 + i * 108, y: 1316, w: 66, h: 66 }, 16);
          ctx.fill();
        });
      }
    });
    const g = ctx.createRadialGradient(W / 2, 800, 200, W / 2, 800, 1300);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.6)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  },
};

// ---- u15 Chat: two photo messages on a dark screen ----------------------------------------
const chat: Template = {
  id: "chat",
  name: "Chat",
  blurb: "Two photos sent as chat messages, with the headline typed in the message box.",
  overlayLabel: "Screen",
  capacity: 2,
  decorations: decos([["times", "Timestamps", true]]),
  slotRects: () => [
    { x: 100, y: 330, w: 880, h: 560 },
    { x: 100, y: 920, w: 880, h: 560 },
  ],
  defaults: (i) => ({
    headline: t({ text: i.headline, font: "sans", size: 34, color: WHITE, x: 0.13, y: 0.785, width: 0.7 }),
    caption: t({ text: i.caption || "online", font: "sans", size: 24, color: "#9ad1b5", x: 0.13, y: 0.135 }),
    overlay: { strength: 1, color: "#0e1311" },
    decorations: { times: true },
  }),
  draw(ctx, _p, s, slots) {
    ctx.fillStyle = "#050605";
    ctx.fillRect(0, 0, W, H);
    rot(ctx, W / 2, H / 2, 1.5, () => {
      ctx.fillStyle = s.overlay.color;
      roundRect(ctx, { x: 50, y: 200, w: W - 100, h: 1560 }, 30);
      ctx.fill();
      [0, 1].forEach((i) => {
        const r = { x: 100, y: 330 + i * 590, w: 880, h: 560 };
        slotPhoto(ctx, slots, i, r, 18);
        ctx.strokeStyle = "#1f6f4a";
        ctx.lineWidth = 6;
        roundRect(ctx, r, 18);
        ctx.stroke();
        if (on(s, "times")) {
          ctx.fillStyle = "rgba(0,0,0,0.45)";
          roundRect(ctx, { x: r.x + r.w - 150, y: r.y + r.h - 56, w: 130, h: 40 }, 20);
          ctx.fill();
          label(ctx, `${timeFrom(s)} ✓`, r.x + r.w - 85, r.y + r.h - 50, 22, WHITE, "sans", "center");
        }
      });
      ctx.fillStyle = "#1b2420";
      roundRect(ctx, { x: 100, y: 1490, w: 880, h: 100 }, 50);
      ctx.fill();
    });
  },
};

// ---- u17 Kiss Mark: blurred lipstick print on the lens, over the face --------------------
const kissmark: Template = {
  id: "kissmark",
  name: "Kiss Mark",
  blurb: "An out-of-focus lipstick print on the lens, right over your face.",
  overlayLabel: "Photo tint",
  decorations: decos([["kiss", "Lipstick mark", true]]),
  defaults: (i) => ({
    headline: t({ text: i.headline, font: "hand", size: 64, color: WHITE, x: 0.08, y: 0.74, width: 0.84 }),
    caption: t({ text: i.caption || fmtDate(i.date), font: "mono", size: 20, color: WHITE, x: 0.08, y: 0.13 }),
    overlay: { strength: 0.12, color: "#4a5a20" },
    decorations: { kiss: true },
  }),
  draw(ctx, _p, s, slots) {
    drawPhoto(ctx, slots.photo(0), FULL, slots.crop(0));
    ctx.fillStyle = rgba(s.overlay.color, s.overlay.strength);
    ctx.fillRect(0, 0, W, H);
  },
  front(ctx, s, slots) {
    if (!on(s, "kiss")) return;
    const f = face(s, slots);
    element(ctx, "kissblur", f.x, f.y, Math.max(640, Math.min(980, f.w * 0.75)), -4);
  },
  text: { headline: { shadow: true }, caption: { shadow: true } },
};

// ---- u18 Xerox: photocopied lyric poster ---------------------------------------------------
const xerox: Template = {
  id: "xerox",
  name: "Xerox Poster",
  blurb: "Photocopied poster: toner-speckled portrait, a lyric column and a giant vertical word.",
  overlayLabel: "Paper",
  decorations: decos([["inset", "Inset sketch", true]]),
  slotRects: () => [{ x: 300, y: 60, w: 740, h: 1800 }],
  defaults: (i) => ({
    headline: t({ text: i.headline.toUpperCase(), font: "sans", size: 190, color: INK, x: 0.04, y: 0.82, width: 0.75 }),
    caption: t({ text: i.caption || "and i've been dreaming of this light, the way it falls on everything", font: "sans", size: 26, color: INK, x: 0.05, y: 0.06, width: 0.21 }),
    overlay: { strength: 1, color: "#e9e9e6" },
    decorations: { inset: true },
    filter: "xerox",
  }),
  draw(ctx, _p, s, slots) {
    ctx.fillStyle = s.overlay.color;
    ctx.fillRect(0, 0, W, H);
    drawGrain(ctx, 0.14, 77);
    slotPhoto(ctx, slots, 0, { x: 300, y: 60, w: 740, h: 1800 }, 30);
    if (on(s, "inset")) {
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      ctx.strokeRect(54, 520, 220, 330);
      const c = slots.crop(0);
      ctx.save();
      ctx.beginPath();
      ctx.rect(56, 522, 216, 326);
      ctx.clip();
      drawPhoto(ctx, slots.photo(0), { x: 56, y: 522, w: 216, h: 326 }, { ...c, zoom: c.zoom * 1.4 });
      ctx.restore();
    }
    ctx.strokeStyle = "#3a3a3a";
    ctx.lineWidth = 18;
    roundRect(ctx, { x: 20, y: 30, w: W - 40, h: H - 60 }, 40);
    ctx.stroke();
    rot(ctx, 1060, 1300, -90, () => label(ctx, "designed by you", 1060, 1290, 18, INK, "sans"));
  },
  text: { headline: { rotate: -Math.PI / 2, lineHeight: 0.8, tracking: -0.02 } },
};

// ---- u19 Yearbook: portrait cards on a tilted sheet --------------------------------------
function mottled(ctx: Ctx, r: Rect) {
  const g = ctx.createRadialGradient(r.x + r.w * 0.45, r.y + r.h * 0.35, r.w * 0.1, r.x + r.w / 2, r.y + r.h / 2, r.w);
  g.addColorStop(0, "#3d6c98");
  g.addColorStop(1, "#0f2540");
  ctx.fillStyle = g;
  ctx.fillRect(r.x, r.y, r.w, r.h);
}
const yearbook: Template = {
  id: "yearbook",
  name: "Yearbook",
  blurb: "School-portrait cards on a tilted sheet, your name set in classic serif caps.",
  overlayLabel: "Sheet",
  needsMask: true,
  decorations: decos([["cards", "Neighbour cards", true]]),
  slotRects: () => [{ x: 160, y: 300, w: 760, h: 900 }],
  defaults: (i) => ({
    headline: t({ text: i.headline.toUpperCase(), font: "serif", size: 52, color: INK, x: 0.5, y: 0.66, width: 0.86, align: "center" }),
    caption: t({ text: (i.caption || "special edition").toUpperCase(), font: "serif", size: 28, color: "#3a3530", x: 0.5, y: 0.7, width: 0.7, align: "center" }),
    overlay: { strength: 1, color: "#e8e2d8" },
    decorations: { cards: true },
  }),
  draw(ctx, _p, s, slots) {
    ctx.fillStyle = "#cfc8bc";
    ctx.fillRect(0, 0, W, H);
    rot(ctx, W / 2, H / 2, -6, () => {
      ctx.fillStyle = s.overlay.color;
      ctx.fillRect(-200, -200, W + 400, H + 400);
      if (on(s, "cards")) {
        for (const r of [
          { x: 160, y: -60, w: 760, h: 300 },
          { x: -680, y: 300, w: 780, h: 900 },
          { x: 980, y: 300, w: 780, h: 900 },
          { x: 160, y: 1560, w: 760, h: 600 },
        ]) {
          mottled(ctx, r);
          ctx.globalAlpha = 0.5;
          slotPhoto(ctx, slots, 1, r);
          ctx.globalAlpha = 1;
        }
      }
      const main = { x: 160, y: 300, w: 760, h: 900 };
      mottled(ctx, main);
      const ok = drawCutout(ctx, slots.photo(0), slots.mask(0), main, slots.crop(0));
      if (!ok) {
        ctx.save();
        ctx.globalAlpha = 0.92;
        slotPhoto(ctx, slots, 0, main);
        ctx.restore();
        const v = ctx.createRadialGradient(main.x + main.w / 2, main.y + main.h * 0.45, main.w * 0.3, main.x + main.w / 2, main.y + main.h / 2, main.w * 0.8);
        v.addColorStop(0, "rgba(15,37,64,0)");
        v.addColorStop(1, "rgba(15,37,64,0.75)");
        ctx.fillStyle = v;
        ctx.fillRect(main.x, main.y, main.w, main.h);
      }
    });
  },
  text: { headline: { rotate: -0.105, tracking: 0.04 }, caption: { rotate: -0.105, tracking: 0.12 } },
};

// ---- u11 / u16: Instagram-style music sticker over a full photo --------------------------
function musicSticker(id: TemplateId, name: string, blurb: string, filter: "sepia" | "faded", cover: { x: number; y: number; scale: number }): Template {
  return {
    id,
    name,
    blurb,
    overlayLabel: "Photo tint",
    decorations: decos([["grain", "Grain", true]]),
    cover: { show: true, style: "plain", rotate: 0, ...cover },
    defaults: (i: TemplateInput) => ({
      headline: t({ text: i.headline, font: "italic", size: 46, color: WHITE, x: 0.08, y: 0.74, width: 0.84 }),
      caption: t({ text: i.caption || fmtDate(i.date), font: "mono", size: 20, color: WHITE, x: 0.08, y: 0.79 }),
      overlay: { strength: 0.08, color: "#000000" },
      decorations: { grain: true },
      filter,
    }),
    draw(ctx: Ctx, _p: Photo, s: StoryState, slots: Slots) {
      drawPhoto(ctx, slots.photo(0), FULL, slots.crop(0));
      ctx.fillStyle = rgba(s.overlay.color, s.overlay.strength);
      ctx.fillRect(0, 0, W, H);
      if (filter === "faded") {
        // Darker corners pull the eye to the cover in the corner.
        const g = ctx.createRadialGradient(W / 2, H * 0.55, H * 0.3, W / 2, H * 0.55, H * 0.75);
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(1, "rgba(0,0,0,0.45)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
      if (on(s, "grain")) drawGrain(ctx, 0.1, id.length);
    },
    text: { headline: { shadow: true }, caption: { shadow: true } },
  };
}

export const REF_TEMPLATES: Record<string, Template> = Object.fromEntries(
  [
    playlist,
    playercut,
    triptych,
    cctv,
    colorbox,
    tornstrip,
    cutout,
    focus,
    viewfinder,
    camcorder,
    sepiabooth,
    desktop,
    chat,
    kissmark,
    xerox,
    yearbook,
    musicSticker("coversepia", "Sepia + Song", "Sepia portrait with a small song cover sticker in the corner.", "sepia", { x: 0.78, y: 0.2, scale: 0.85 }),
    musicSticker("covercorner", "Song Corner", "Full photo with the song's cover and title tucked top-left.", "faded", { x: 0.28, y: 0.21, scale: 1.05 }),
  ].map((tpl) => [tpl.id, tpl]),
);
