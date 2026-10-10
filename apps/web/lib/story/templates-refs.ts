// Layouts recreated from the owner's reference set (design-refs/pinterest/user1, u01–u19).
// Brand UIs in the refs (streaming apps, camera makers, magazines) are reduced to generic
// shapes; text comes from the Story, never invented track names.
import { drawCutout } from "./cutout";
import { type Ctx, type Photo, drawGrain, drawPhoto, fontString, rgba, rng, roundRect } from "./draw";
import { drawScreen, propImage } from "./elements";
import { filteredPhoto, rotatedPhoto } from "./filters";
import { type Slots, type Template, boxAt, decos, fmtDate, on, pad, t } from "./kit";
import type { Sticker, StickerKind } from "./stickers";
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

const fp = (i: TemplateInput) => i.focuses?.[0] ?? i.focus ?? { x: 0.5, y: 0.42 };
/** A layout-placed element sticker; `px` is its longest side in Story pixels. */
const el = (kind: StickerKind, x: number, y: number, px: number, rotate = 0, color = "#ffffff"): Sticker => ({
  id: `layout-${kind}-${Math.round(x * 1000)}-${Math.round(y * 1000)}`,
  kind,
  x: Math.min(1, Math.max(0, x)),
  y: Math.min(1, Math.max(0, y)),
  scale: Math.min(5, Math.max(0.3, px / 240)),
  rotate: ((rotate % 360) + 360) % 360,
  color,
  layout: true,
});

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
function slotPhoto(ctx: Ctx, slots: Slots, i: number, r: Rect, radius = 0, photoOverride?: (p: Photo) => Photo, key?: string) {
  ctx.save();
  if (radius) roundRect(ctx, r, radius);
  else {
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
  }
  ctx.clip();
  const own = slots.own(i);
  const base = own ? slots.crop(i) : slots.adjust(key ?? `slot${i}`, slots.crop(0));
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

/** The Story's outline setting; `base` scales the width for layouts with a subtler die-cut. */
function outlineOf(s: StoryState, base = 14) {
  const o = s.outline ?? { show: true, color: WHITE, width: 14, margin: 0 };
  return o.show && o.width > 0 && base > 0 ? { color: o.color, width: (o.width * base) / 14, margin: o.margin ?? 0 } : undefined;
}

function rot(ctx: Ctx, cx: number, cy: number, deg: number, fn: () => void) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.translate(-cx, -cy);
  fn();
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

// ---- u01 Playlist (pin 613967361752648972): the owner's screen template (Instagram Story +
// sideways Spotify playlist, green windows keyed out) with your photo above and a prop photo —
// a can, a matcha, a turntable… (shuffle) or your own second photo — below. Sideways, like the pin.
const PL_TOP: Rect = { x: 5, y: 587, w: 1070, h: 631 };
const PL_BOT: Rect = { x: 5, y: 1229, w: 1070, h: 691 };
const playlist: Template = {
  id: "playlist",
  name: "Playlist",
  blurb: "Instagram Story with a sideways Spotify playlist: your photo plus a prop shot (shuffle it, or use yours).",
  overlayLabel: "Photo tint",
  capacity: 2,
  photoRot: 90,
  prop: "coke",
  decorations: [],
  stickers: () => [
    { ...el("heart", 0.3, 0.84, 84, 350), color: "#ff8a3d", scale: 0.35 },
    { ...el("heart", 0.2, 0.93, 96, 10), color: "#ff3d8b", scale: 0.4 },
  ],
  slotRects: () => [PL_TOP, PL_BOT],
  defaults: (i) => ({
    headline: t({ text: i.headline, font: "sans", size: 30, color: WHITE, x: 0.06, y: 0.8, width: 0.6 }),
    caption: t({ text: "", font: "mono", size: 20, color: WHITE, x: 0.06, y: 0.8 }),
    overlay: { strength: 0.04, color: "#000000" },
    decorations: {},
  }),
  draw(ctx, _p, s, slots) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    slotPhoto(ctx, slots, 0, PL_TOP);
    if (slots.own(1)) slotPhoto(ctx, slots, 1, PL_BOT);
    else {
      const img = propImage(s.prop ?? "coke");
      if (img) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(PL_BOT.x, PL_BOT.y, PL_BOT.w, PL_BOT.h);
        ctx.clip();
        // Turned like the reference; framing is adjustable (views["slot1"]).
        drawPhoto(ctx, rotatedPhoto(img, 90), PL_BOT, slots.adjust("slot1", { zoom: 1, x: 0.5, y: 0.5, fit: "cover" }));
        ctx.restore();
      }
    }
    ctx.fillStyle = rgba(s.overlay.color, s.overlay.strength);
    ctx.fillRect(0, 0, W, H);
    drawScreen(ctx, "playlist", W, H);
  },
  text: { headline: { shadow: true } },
};

// ---- u02 Player Cutout (pin 1089308228644747115): the whole Story is a sideways music player —
// you, die-cut and lying across a collage, above vertical progress/volume bars and the song.
// Drawn in landscape coordinates (1920×1080) and turned 90° clockwise onto the Story.
const LAND = { w: H, h: W };
const toLand = (ctx: Ctx) => {
  ctx.translate(W, 0);
  ctx.rotate(Math.PI / 2);
};
const PC_PAPER: Rect = { x: 90, y: 40, w: 560, h: 955 }; // landscape px
const PC_CUT: Rect = { x: 30, y: -10, w: 680, h: 1100 };
function heartRings(ctx: Ctx, cx: number, cy: number, n: number) {
  ctx.save();
  ctx.lineWidth = 9;
  for (let k = n; k > 0; k--) {
    ctx.strokeStyle = k % 2 ? "rgba(235,222,205,0.9)" : "rgba(120,100,90,0.8)";
    const z = k * 15;
    ctx.beginPath();
    ctx.moveTo(cx, cy + z * 0.75);
    ctx.bezierCurveTo(cx - z * 1.4, cy - z * 0.15, cx - z * 0.55, cy - z * 1.05, cx, cy - z * 0.4);
    ctx.bezierCurveTo(cx + z * 0.55, cy - z * 1.05, cx + z * 1.4, cy - z * 0.15, cx, cy + z * 0.75);
    ctx.stroke();
  }
  ctx.restore();
}
const playercut: Template = {
  id: "playercut",
  name: "Player Cutout",
  blurb: "A sideways music player: you die-cut over a collage, the song running down the side.",
  overlayLabel: "Card colour",
  needsMask: true,
  outline: true,
  slotTurn: 90,
  decorations: decos([["collage", "Collage clippings", true], ["controls", "Player controls", true]]),
  // Story-space box of the photo area (for drag / selection).
  slotRects: () => [{ x: 0, y: PC_CUT.x, w: W, h: PC_CUT.w }],
  defaults: (i) => ({
    headline: t({ text: i.music?.title || i.headline, font: "sans", size: 50, color: WHITE, x: 0.898, y: 0.372, width: 0.5 }),
    caption: t({ text: i.music?.artist || i.caption || fmtDate(i.date), font: "sans", size: 40, color: "#e7a3a8", x: 0.842, y: 0.372, width: 0.5 }),
    overlay: { strength: 1, color: "#5b1515" },
    decorations: { collage: true, controls: true },
    filter: "noir",
  }),
  draw(ctx, _p, s, slots) {
    ctx.fillStyle = "#2a0909";
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    toLand(ctx);
    ctx.fillStyle = s.overlay.color;
    roundRect(ctx, { x: 24, y: 22, w: LAND.w - 48, h: LAND.h - 44 }, 70);
    ctx.fill();
    const sheen = ctx.createLinearGradient(0, 0, LAND.w, LAND.h);
    sheen.addColorStop(0, "rgba(255,255,255,0.06)");
    sheen.addColorStop(1, "rgba(0,0,0,0.18)");
    ctx.fillStyle = sheen;
    roundRect(ctx, { x: 24, y: 22, w: LAND.w - 48, h: LAND.h - 44 }, 70);
    ctx.fill();
    // Collage paper: faded sepia clippings of the photo, columns of tiny type, heart rings.
    ctx.save();
    ctx.beginPath();
    ctx.rect(PC_PAPER.x, PC_PAPER.y, PC_PAPER.w, PC_PAPER.h);
    ctx.clip();
    slotPhoto(ctx, slots, 1, PC_PAPER, 0, (p) => filteredPhoto(p, "sepia"), "paper");
    ctx.fillStyle = "rgba(225,212,195,0.55)";
    ctx.fillRect(PC_PAPER.x, PC_PAPER.y, PC_PAPER.w, PC_PAPER.h);
    if (on(s, "collage")) {
      const tiles: Rect[] = [
        { x: 100, y: 50, w: 250, h: 260 }, { x: 360, y: 640, w: 280, h: 340 }, { x: 110, y: 720, w: 210, h: 250 },
      ];
      tiles.forEach((r, n) => {
        ctx.save();
        ctx.globalAlpha = 0.7;
        slotPhoto(ctx, slots, 2 + n, r, 0, (p) => filteredPhoto(p, "bw"), `clip${n}`);
        ctx.restore();
        ctx.strokeStyle = "rgba(60,50,45,0.6)";
        ctx.lineWidth = 3;
        ctx.strokeRect(r.x, r.y, r.w, r.h);
      });
      const rr = rng(71);
      ctx.fillStyle = "rgba(70,60,55,0.65)";
      for (let col = 0; col < 4; col++) {
        for (let k = 0; k < 18; k++) {
          if (rr() < 0.2) continue;
          ctx.fillRect(560 - col * 30, 380 + k * 22, 18, 14);
        }
      }
      heartRings(ctx, 560, 150, 7);
    }
    ctx.restore();
    // You: high-contrast B&W with grain and a thin white die-cut edge, overflowing the paper.
    const ok = drawCutout(ctx, slots.photo(0), slots.mask(0), PC_CUT, slots.crop(0), outlineOf(s, 6));
    if (!ok) slotPhoto(ctx, slots, 0, PC_PAPER);
    else drawGrain(ctx, 0.06, 88);
    label(ctx, "Headphones", 720, 48, 30, "#e7a3a8", "sans");
    if (on(s, "controls")) {
      const bar = (y: number, k: number) => {
        ctx.fillStyle = "rgba(231,163,168,0.3)";
        roundRect(ctx, { x: 730, y, w: 980, h: 12 }, 6);
        ctx.fill();
        ctx.fillStyle = "#e7a3a8";
        roundRect(ctx, { x: 730, y, w: 980 * k, h: 12 }, 6);
        ctx.fill();
      };
      bar(232, 0.52);
      label(ctx, "2:21", 730, 256, 28, "#e7a3a8", "sans");
      label(ctx, "-2:20", 1710, 256, 28, "#e7a3a8", "sans", "right");
      ctx.fillStyle = WHITE;
      const tri = (x: number, dir: 1 | -1) => {
        ctx.beginPath();
        ctx.moveTo(x, 510);
        ctx.lineTo(x + dir * 40, 540);
        ctx.lineTo(x, 570);
        ctx.fill();
      };
      tri(930, -1);
      tri(970, -1);
      tri(1340, 1);
      tri(1300, 1);
      roundRect(ctx, { x: 1110, y: 505, w: 22, h: 70 }, 4);
      ctx.fill();
      roundRect(ctx, { x: 1148, y: 505, w: 22, h: 70 }, 4);
      ctx.fill();
      bar(890, 0.62);
      ctx.fillStyle = "#e7a3a8";
      ctx.fillRect(690, 884, 14, 24);
      ctx.beginPath();
      ctx.moveTo(704, 884);
      ctx.lineTo(718, 872);
      ctx.lineTo(718, 920);
      ctx.lineTo(704, 908);
      ctx.fill();
      ctx.fillRect(1726, 884, 14, 24);
    }
    ctx.restore();
  },
  text: { headline: { rotate: Math.PI / 2 }, caption: { rotate: Math.PI / 2 } },
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
/** Default CCTV frames for this photo (Story px): subject, detail, zoomed callout. */
function cctvDefaults(s: StoryState, slots: Slots) {
  const f = face(s, slots);
  const subject = cctvBox(f);
  const detail = { x: f.x - subject.w * 0.4, y: Math.min(1450, subject.y + subject.h + subject.w * 1.1), w: subject.w * 0.8, h: subject.w * 0.7 };
  return { subject, detail, inset: cctvInset(f, subject) };
}
function tag(ctx: Ctx, text: string, r: Rect, right: boolean) {
  ctx.fillStyle = RED;
  const w = Math.max(110, text.length * 15 + 24);
  ctx.fillRect(right ? r.x + r.w - w : r.x, r.y - 40, w, 40);
  label(ctx, text, (right ? r.x + r.w - w : r.x) + w / 2, r.y - 33, 23, WHITE, "mono", "center");
}
const cctv: Template = {
  id: "cctv",
  name: "CCTV",
  blurb: "Surveillance-cam frame: timestamp, red tracking boxes and zoomed callouts — move any box.",
  overlayLabel: "Photo tint",
  decorations: decos([["callouts", "Zoom callout", true], ["detail", "Detail box", true]]),
  boxes: (s, slots) => {
    const d = cctvDefaults(s, slots);
    return [
      { key: "subject", label: "Subject box", r: d.subject },
      ...(on(s, "detail") ? [{ key: "detail", label: "Detail box", r: d.detail }] : []),
      ...(on(s, "callouts") ? [{ key: "inset", label: "Zoom callout", r: d.inset, image: true }] : []),
    ];
  },
  stickers: (i) => [
    el("folder", 150 / W, 980 / H, 120, -6),
    el("folder", 210 / W, 1140 / H, 80, 4),
    el("warning", (W - 170) / W, 560 / H, 110),
    el("cursor", fp(i).x + 0.05, fp(i).y + 0.04, 110),
  ],
  defaults: (i) => ({
    headline: t({ text: i.headline.toUpperCase(), font: "mono", size: 40, color: WHITE, x: 0.08, y: 0.09, width: 0.6 }),
    caption: t({ text: `DATA UPDATE\n${(i.caption || fmtDate(i.date)).toUpperCase()}`, font: "mono", size: 24, color: WHITE, x: 0.08, y: 0.78, width: 0.5 }),
    overlay: { strength: 0.12, color: "#000000" },
    decorations: { callouts: true, detail: true },
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
    const d = cctvDefaults(s, slots);
    const box = boxAt(s, "subject", d.subject);
    ctx.strokeStyle = RED;
    ctx.lineWidth = 5;
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    tag(ctx, "SUBJECT", box, true);
    if (on(s, "callouts")) {
      const ins = boxAt(s, "inset", d.inset);
      const fromRight = ins.x + ins.w / 2 > box.x + box.w / 2;
      ctx.strokeStyle = RED;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(fromRight ? box.x + box.w : box.x, box.y + box.h);
      ctx.lineTo(fromRight ? ins.x : ins.x + ins.w, ins.y);
      ctx.stroke();
      ctx.save();
      ctx.beginPath();
      ctx.rect(ins.x, ins.y, ins.w, ins.h);
      ctx.clip();
      const c = slots.crop(0);
      drawPhoto(ctx, filteredPhoto(slots.photo(0), "bw"), ins, slots.adjust("inset", { ...c, zoom: c.zoom * 2.4, x: s.focus?.x ?? 0.5, y: s.focus?.y ?? 0.4 }));
      ctx.restore();
      ctx.lineWidth = 5;
      ctx.strokeRect(ins.x, ins.y, ins.w, ins.h);
      label(ctx, `#${s.accent.replace("#", "").toUpperCase()}`, ins.x, ins.y - 32, 22, WHITE);
    }
    if (on(s, "detail")) {
      const det = boxAt(s, "detail", d.detail);
      ctx.strokeStyle = RED;
      ctx.lineWidth = 5;
      ctx.strokeRect(det.x, det.y, det.w, det.h);
      tag(ctx, "DETAIL", det, false);
    }
  },
};

function cctvBox(f: { x: number; y: number; w: number }): Rect {
  const bw = Math.max(240, Math.min(380, f.w * 0.26));
  return { x: f.x - bw / 2, y: f.y - bw * 0.62, w: bw, h: bw * 1.15 };
}

function cctvInset(f: { x: number; y: number }, box: Rect): Rect {
  return { x: f.x < W / 2 ? W - 400 : 90, y: Math.min(1180, box.y + box.h + 120), w: 310, h: 310 };
}

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
    drawCutout(ctx, filteredPhoto(slots.photo(0), "bw"), slots.mask(0), FULL, slots.crop(0), outlineOf(s, 0));
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
  text: { headline: { lineHeight: 0.85, tracking: 0.02, fit: true } },
};

// ---- Red Block (pin by cassiano mendes): B&W photo, translucent red block in front of or
// behind the person, a few words set small inside it.
const RED_BLOCK: Rect = { x: 430, y: 700, w: 400, h: 690 };
/** The block starts on the open side of the subject, partly behind them (like the pin). */
const redBlockAt = (fx: number): Rect => ({ ...RED_BLOCK, x: fx < 0.5 ? Math.min(640, fx * W + 260) : Math.max(50, fx * W - 680) });
const redblock: Template = {
  id: "redblock",
  name: "Red Block",
  blurb: "Black-and-white photo with a translucent red block — behind you or in front, move and resize it.",
  overlayLabel: "Red block",
  needsMask: true,
  decorations: decos([["behind", "Block behind you", true]]),
  boxes: (s) => [{ key: "block", label: "Red block", r: redBlockAt(s.focus?.x ?? 0.5), tinted: true, layer: "behind" }],
  defaults: (i) => {
    const b = redBlockAt(fp(i).x);
    const right = (b.x + b.w - 24) / W;
    return {
      headline: t({ text: i.headline.toLowerCase(), font: "sans", size: 26, color: WHITE, x: right, y: (b.y + 24) / H, width: 0.32, align: "right" }),
      caption: t({ text: i.caption || fmtDate(i.date), font: "sans", size: 20, color: WHITE, x: right, y: (b.y + b.h - 70) / H, width: 0.32, align: "right" }),
      overlay: { strength: 0.82, color: "#d23b2c" },
      decorations: { behind: true },
      filter: "bw",
    };
  },
  draw(ctx, _p, s, slots) {
    drawPhoto(ctx, slots.photo(0), FULL, slots.crop(0));
    drawGrain(ctx, 0.08, 19);
    if (on(s, "behind")) redBlock(ctx, s);
  },
  front(ctx, s, slots) {
    if (on(s, "behind")) drawCutout(ctx, slots.photo(0), slots.mask(0), FULL, slots.crop(0));
    else redBlock(ctx, s);
  },
};
function redBlock(ctx: Ctx, s: StoryState) {
  const r = boxAt(s, "block", redBlockAt(s.focus?.x ?? 0.5));
  ctx.fillStyle = rgba(s.overlay.color, s.overlay.strength);
  ctx.fillRect(r.x, r.y, r.w, r.h);
}

// ---- u06 Torn Strip: magazine cover torn open across the eyes -----------------------------
/** Organic noise 0..1 along x (layered sines + seeded jitter) for paper tears. */
function tearNoise(seed: number) {
  const r = rng(seed);
  const waves = [0, 1, 2, 3].map((k) => ({ f: (0.004 + r() * 0.006) * (k + 1) ** 1.6, p: r() * 6.28, a: 1 / (k + 1.3) }));
  const jitter = Array.from({ length: 400 }, () => r());
  return (x: number) => {
    let v = 0;
    for (const w of waves) v += Math.sin(x * w.f + w.p) * w.a;
    return 0.5 + v * 0.3 + (jitter[Math.floor(Math.abs(x) / 4) % 400]! - 0.5) * 0.18;
  };
}

/**
 * A torn paper edge like a ripped magazine page: white paper core of varying thickness along a
 * slanted line, a fibrous fringe on the torn side, and a soft shadow cast onto the layer below.
 * `dir` = 1 tears downward into the band (top edge), -1 upward (bottom edge).
 */
function tearEdge(ctx: Ctx, y0: number, y1: number, thick: [number, number], dir: 1 | -1, seed: number) {
  const n1 = tearNoise(seed);
  const n2 = tearNoise(seed + 9);
  const at = (x: number) => y0 + ((y1 - y0) * x) / W; // slanted base line
  const inner = (x: number) => at(x) + dir * (thick[0] + (thick[1] - thick[0]) * n1(x)); // torn side
  const outer = (x: number) => at(x) - dir * (6 + 10 * n2(x)); // where the page continues
  // Shadow cast onto the revealed layer.
  ctx.save();
  ctx.beginPath();
  for (let x = -20; x <= W + 20; x += 6) ctx.lineTo(x, inner(x));
  for (let x = W + 20; x >= -20; x -= 6) ctx.lineTo(x, inner(x) + dir * 26);
  ctx.closePath();
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.filter = "blur(10px)";
  ctx.fill();
  ctx.restore();
  // Paper core.
  ctx.save();
  ctx.beginPath();
  for (let x = -20; x <= W + 20; x += 4) ctx.lineTo(x, outer(x));
  for (let x = W + 20; x >= -20; x -= 4) ctx.lineTo(x, inner(x));
  ctx.closePath();
  const g = ctx.createLinearGradient(0, at(W / 2) - dir * 10, 0, at(W / 2) + dir * thick[1]);
  g.addColorStop(0, "#fbfaf6");
  g.addColorStop(1, "#e9e6df");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  // Fibrous fringe along the torn side.
  const r = rng(seed + 3);
  ctx.save();
  for (let x = 0; x < W; x += 2 + r() * 7) {
    if (r() < 0.35) continue;
    const y = inner(x);
    const len = 2 + r() ** 2 * 14; // mostly short, a few long strands
    ctx.strokeStyle = `rgba(255,255,255,${0.35 + r() * 0.5})`;
    ctx.lineWidth = 0.8 + r() * 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y - dir * 2);
    ctx.quadraticCurveTo(x + (r() - 0.5) * 8, y + dir * len * 0.5, x + (r() - 0.5) * 10, y + dir * len);
    ctx.stroke();
  }
  ctx.restore();
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
    // The revealed layer: same photo in black and white, darker and nudged, ghost masthead behind.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top - 60, W, bot - top + 120);
    ctx.clip();
    const c = slots.crop(0);
    drawPhoto(ctx, filteredPhoto(slots.photo(0), "bw"), FULL, slots.adjust("band", { ...c, zoom: c.zoom * 1.06 }));
    ctx.fillStyle = "rgba(20,20,20,0.22)";
    ctx.fillRect(0, top - 60, W, bot - top + 120);
    if (on(s, "ghost")) {
      ctx.globalAlpha = 0.42;
      ctx.font = fontString("display", (bot - top) * 0.95);
      ctx.fillStyle = "#3a3a3a";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(s.headline.text.toUpperCase(), W / 2, (top + bot) / 2 + 6, W * 1.15);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    // Thin tear on top (slanting up to the right), thick tear below (slanting down).
    tearEdge(ctx, top + 10, top - 14, [10, 34], 1, 11);
    tearEdge(ctx, bot + 6, bot + 34, [22, 64], -1, 23);
  },
  text: { headline: { tracking: 0.08, fit: true, oneLine: true } },
};

// ---- u07 Sticker Cutout: you as a die-cut sticker over huge words ------------------------
const cutout: Template = {
  id: "cutout",
  outline: true,
  name: "Sticker Cutout",
  blurb: "You as a die-cut sticker with a white outline, standing over huge words.",
  overlayLabel: "Photo tint",
  needsMask: true,
  decorations: [],
  stickers: (i) => [el("faceheart", fp(i).x + 0.06, fp(i).y + 0.035, 72), el("cat", 220 / W, 1520 / H, 170)],
  defaults: (i) => ({
    headline: t({ text: i.headline.toUpperCase(), font: "sans", size: 210, color: WHITE, x: 0.5, y: 0.14, width: 0.95, align: "center" }),
    caption: t({ text: i.caption || fmtDate(i.date), font: "mono", size: 22, color: WHITE, x: 0.08, y: 0.79 }),
    overlay: { strength: 0.1, color: "#000000" },
    decorations: {},
  }),
  draw(ctx, _p, s, slots) {
    drawPhoto(ctx, slots.photo(0), FULL, slots.crop(0));
    ctx.fillStyle = rgba(s.overlay.color, s.overlay.strength);
    ctx.fillRect(0, 0, W, H);
  },
  front(ctx, s, slots) {
    drawCutout(ctx, slots.photo(0), slots.mask(0), FULL, slots.crop(0), outlineOf(s));
  },
  text: { headline: { lineHeight: 0.84, tracking: -0.04, fit: true }, caption: { shadow: true } },
};

// ---- u08 Focus: blurred B&W with a sharp colour strip over the eyes ----------------------
const focus: Template = {
  id: "focus",
  name: "Focus",
  blurb: "Soft black-and-white blur with one sharp strip across the eyes.",
  overlayLabel: "Blur tint",
  decorations: decos([["barcode", "Date", true]]),
  stickers: () => [el("barcode", (W - 170) / W, 1520 / H, 260, 0, "#111111")],
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
    }
  },
  text: { headline: { outline: 3, tracking: 0.08, fit: true }, caption: { rotate: -Math.PI / 2 } },
};

// ---- u09 Camera LCD: the photo on a camera's back screen ---------------------------------
const viewfinder: Template = {
  id: "viewfinder",
  name: "Camera Screen",
  blurb: "Your photo on a camera's back screen, with focus brackets and REC.",
  overlayLabel: "Body",
  decorations: decos([["hud", "Screen readouts", true]]),
  stickers: (i) => [
    el("brackets", (130 + fp(i).x * 820) / W, (330 + fp(i).y * 1120) / H, 260),
    el("rec", 840 / W, 380 / H, 140),
  ],
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
  decorations: decos([["hud", "Viewfinder readouts", true]]),
  stickers: (i) => [el("brackets", fp(i).x, fp(i).y, 280), el("rec", (W - 150) / W, 305 / H, 150)],
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
    label(ctx, "AF    ISO 200    1/60    ▮▮▮", 70, 290, 22, WHITE);
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

// ---- u15 / pin 997125173755428109: WhatsApp on a laptop — the owner's green-screen template.
// public/templates/whatsapp-screen.png has the green keyed out; photos sit in its windows.
const WA: Rect[] = [
  { x: 121, y: 0, w: 931, h: 173 },
  { x: 169, y: 144, w: 877, h: 659 },
  { x: 155, y: 819, w: 860, h: 589 },
];
const chat: Template = {
  id: "chat",
  name: "WhatsApp Screen",
  blurb: "Your photos as WhatsApp messages on a laptop screen at night.",
  overlayLabel: "Screen tint",
  capacity: 3,
  decorations: decos([["times", "Timestamps", true]]),
  slotRects: () => [WA[1]!, WA[2]!, WA[0]!],
  defaults: (i) => ({
    headline: t({ text: i.headline, font: "sans", size: 30, color: "#e9edef", x: 0.06, y: 0.746, width: 0.7 }),
    caption: t({ text: "", font: "mono", size: 20, color: WHITE, x: 0.06, y: 0.8 }),
    overlay: { strength: 0.06, color: "#000000" },
    decorations: { times: true },
  }),
  draw(ctx, _p, s, slots) {
    ctx.fillStyle = "#0b0b0b";
    ctx.fillRect(0, 0, W, H);
    // Slot order: middle (main), bottom, then the top sliver.
    slotPhoto(ctx, slots, 0, WA[1]!);
    slotPhoto(ctx, slots, 1, WA[2]!);
    slotPhoto(ctx, slots, 2, WA[0]!);
    ctx.fillStyle = rgba(s.overlay.color, s.overlay.strength);
    ctx.fillRect(0, 0, W, H);
    drawScreen(ctx, "whatsapp", W, H);
    if (on(s, "times")) {
      for (const [x, y] of [[985, 152], [957, 778], [933, 1338]] as const) {
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.6)";
        ctx.shadowBlur = 6;
        label(ctx, timeFrom(s), x - 28, y - 14, 25, WHITE, "sans", "right");
        ctx.strokeStyle = WHITE;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(x - 8, y, 10, 0, Math.PI * 2);
        ctx.moveTo(x - 8, y - 6);
        ctx.lineTo(x - 8, y);
        ctx.lineTo(x - 3, y + 3);
        ctx.stroke();
        ctx.restore();
      }
    }
  },
};

// ---- u17 Kiss Mark: blurred lipstick print on the lens, over the face --------------------
const kissmark: Template = {
  id: "kissmark",
  name: "Kiss Mark",
  blurb: "A translucent lipstick kiss on the lens, right over your face.",
  overlayLabel: "Photo tint",
  decorations: [],
  stickers: (i) => [el("kiss", fp(i).x, fp(i).y + 0.01, 860, -6)],
  defaults: (i) => ({
    headline: t({ text: i.headline, font: "hand", size: 64, color: WHITE, x: 0.08, y: 0.74, width: 0.84 }),
    caption: t({ text: i.caption || fmtDate(i.date), font: "mono", size: 20, color: WHITE, x: 0.08, y: 0.13 }),
    overlay: { strength: 0.12, color: "#4a5a20" },
    decorations: {},
  }),
  draw(ctx, _p, s, slots) {
    drawPhoto(ctx, slots.photo(0), FULL, slots.crop(0));
    ctx.fillStyle = rgba(s.overlay.color, s.overlay.strength);
    ctx.fillRect(0, 0, W, H);
  },
  text: { headline: { shadow: true }, caption: { shadow: true } },
};

// ---- u18 Xerox: photocopied lyric poster ---------------------------------------------------
const xerox: Template = {
  id: "xerox",
  name: "Xerox Poster",
  boxes: (s) => (on(s, "inset") ? [{ key: "inset", label: "Inset sketch", r: XEROX_INSET, image: true }] : []),
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
      const ib = boxAt(s, "inset", XEROX_INSET);
      ctx.strokeRect(ib.x - 2, ib.y - 2, ib.w + 4, ib.h + 4);
      const c = slots.crop(0);
      ctx.save();
      ctx.beginPath();
      ctx.rect(ib.x, ib.y, ib.w, ib.h);
      ctx.clip();
      drawPhoto(ctx, slots.photo(0), ib, slots.adjust("inset", { ...c, zoom: c.zoom * 1.4 }));
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

const XEROX_INSET: Rect = { x: 56, y: 522, w: 216, h: 326 };

// ---- u19 / pin 1093178509566174434: yearbook sheet photographed in a dim room ----------
function mottled(ctx: Ctx, r: Rect, seed: number) {
  const g = ctx.createRadialGradient(r.x + r.w * 0.42, r.y + r.h * 0.3, r.w * 0.08, r.x + r.w / 2, r.y + r.h / 2, r.w * 0.95);
  g.addColorStop(0, "#4a78a3");
  g.addColorStop(0.55, "#22466e");
  g.addColorStop(1, "#0c1c33");
  ctx.fillStyle = g;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  // Studio-backdrop mottling.
  const rand = rng(seed);
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  for (let k = 0; k < 14; k++) {
    ctx.fillStyle = `rgba(${rand() > 0.5 ? "120,160,200" : "5,15,30"},0.12)`;
    ctx.beginPath();
    ctx.ellipse(r.x + rand() * r.w, r.y + rand() * r.h, r.w * (0.1 + rand() * 0.25), r.h * (0.06 + rand() * 0.15), rand() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
/** A portrait card: blue backdrop + the person (cutout when available). */
function portraitCard(ctx: Ctx, slots: Slots, r: Rect, seed: number, i: number) {
  mottled(ctx, r, seed);
  const ok = drawCutout(ctx, slots.photo(0), slots.mask(0), r, { ...slots.crop(0), zoom: slots.crop(0).zoom * (i ? 1.05 : 1) });
  if (!ok) {
    ctx.save();
    ctx.globalAlpha = 0.85;
    slotPhoto(ctx, slots, i, r);
    ctx.restore();
    const v = ctx.createRadialGradient(r.x + r.w / 2, r.y + r.h * 0.45, r.w * 0.3, r.x + r.w / 2, r.y + r.h / 2, r.w * 0.8);
    v.addColorStop(0, "rgba(12,28,51,0)");
    v.addColorStop(1, "rgba(12,28,51,0.8)");
    ctx.fillStyle = v;
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
}
const yearbook: Template = {
  id: "yearbook",
  name: "Yearbook",
  blurb: "School-portrait cards on a sheet, photographed in a dim, moody room.",
  overlayLabel: "Room light",
  needsMask: true,
  decorations: decos([["cards", "Neighbour cards", true], ["grain", "Film grain", true]]),
  slotRects: () => [{ x: 170, y: 330, w: 740, h: 880 }],
  defaults: (i) => ({
    headline: t({ text: i.headline.toUpperCase(), font: "serif", size: 50, color: "#1b1a18", x: 0.5, y: 0.665, width: 0.86, align: "center" }),
    caption: t({ text: (i.caption || "special edition").toUpperCase(), font: "serif", size: 27, color: "#2f2b26", x: 0.5, y: 0.705, width: 0.7, align: "center" }),
    overlay: { strength: 0.72, color: "#0d0b09" },
    decorations: { cards: true, grain: true },
  }),
  draw(ctx, _p, s, slots) {
    ctx.fillStyle = "#14110e";
    ctx.fillRect(0, 0, W, H);
    rot(ctx, W / 2, H / 2, -7, () => {
      ctx.fillStyle = "#c4bdb1";
      ctx.fillRect(-120, -160, W + 240, H + 320);
      drawGrain(ctx, 0.08, 17);
      if (on(s, "cards")) {
        [
          { x: 170, y: -40, w: 740, h: 260 },
          { x: -640, y: 330, w: 740, h: 880 },
          { x: 980, y: 330, w: 740, h: 880 },
          { x: 170, y: 1600, w: 740, h: 600 },
        ].forEach((r, n) => portraitCard(ctx, slots, r, 11 + n, n + 1));
      }
      portraitCard(ctx, slots, { x: 170, y: 330, w: 740, h: 880 }, 7, 0);
    });
  },
  after(ctx, s) {
    // The room: warm dim light falling off to dark corners, over everything incl. the words.
    // A single warm lamp on the main card; everything else falls into shadow.
    const g = ctx.createRadialGradient(W * 0.5, H * 0.4, H * 0.08, W * 0.5, H * 0.45, H * 0.72);
    g.addColorStop(0, "rgba(255,200,140,0.05)");
    g.addColorStop(0.45, rgba(s.overlay.color, s.overlay.strength * 0.45));
    g.addColorStop(1, rgba(s.overlay.color, Math.min(1, s.overlay.strength + 0.32)));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = rgba(s.overlay.color, s.overlay.strength * 0.3);
    ctx.fillRect(0, 0, W, H);
    if (on(s, "grain")) drawGrain(ctx, 0.14, 63);
  },
  text: { headline: { rotate: -0.122, tracking: 0.04 }, caption: { rotate: -0.122, tracking: 0.12 } },
};

// ---- pin 1151514198494369585: the song sticker right on the lips -------------------------
const covermouth: Template = {
  id: "covermouth",
  name: "Song on Lips",
  blurb: "Close-up with the song's Instagram sticker placed right over the lips.",
  overlayLabel: "Photo tint",
  decorations: decos([["grain", "Grain", true]]),
  cover: { show: true, style: "ig", scale: 0.85, rotate: 0 },
  defaults: (i) => ({
    headline: t({ text: i.headline, font: "sans", size: 30, color: WHITE, x: 0.08, y: 0.78, width: 0.84 }),
    caption: t({ text: "", font: "mono", size: 20, color: WHITE, x: 0.08, y: 0.8 }),
    overlay: { strength: 0.05, color: "#000000" },
    decorations: { grain: true },
  }),
  draw(ctx, _p, s, slots) {
    drawPhoto(ctx, slots.photo(0), FULL, slots.crop(0));
    ctx.fillStyle = rgba(s.overlay.color, s.overlay.strength);
    ctx.fillRect(0, 0, W, H);
    if (on(s, "grain")) drawGrain(ctx, 0.08, 5);
  },
  text: { headline: { shadow: true } },
};

// ---- pin 1125970344365273773: tilted night-vision camcorder frame ------------------------
const camtilt: Template = {
  id: "camtilt",
  name: "Night Cam",
  blurb: "A tilted, green night-vision camcorder frame with the date burned in.",
  overlayLabel: "Night tint",
  decorations: decos([["lines", "Frame lines", true]]),
  slotRects: () => [{ x: 140, y: 470, w: 800, h: 1020 }],
  defaults: (i) => ({
    headline: t({ text: i.headline, font: "hand", size: 64, color: "#d8ffe0", x: 0.1, y: 0.42, width: 0.5 }),
    caption: t({ text: i.caption || "no, no, no,", font: "hand", size: 36, color: "#d8ffe0", x: 0.3, y: 0.56, width: 0.5 }),
    overlay: { strength: 0.32, color: "#3dff7a" },
    decorations: { lines: true },
    filter: "noir",
  }),
  draw(ctx, _p, s, slots) {
    ctx.fillStyle = "#0c0c0c";
    ctx.fillRect(0, 0, W, H);
    if (on(s, "lines")) {
      ctx.fillStyle = "#f2f2f2";
      ctx.fillRect(56, 380, 5, 1220);
      ctx.fillRect(W - 62, 380, 5, 1220);
    }
    rot(ctx, W / 2, 980, 9, () => {
      const r = { x: 140, y: 470, w: 800, h: 1020 };
      ctx.save();
      roundRect(ctx, r, 30);
      ctx.clip();
      slotPhoto(ctx, slots, 0, r);
      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = rgba(s.overlay.color, s.overlay.strength + 0.4);
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = rgba(s.overlay.color, s.overlay.strength * 0.35);
      ctx.fillRect(r.x, r.y, r.w, r.h);
      drawGrain(ctx, 0.18, 41);
      ctx.restore();
      const d = new Date(2000 + Number(s.stamp.slice(1, 3)), Number(s.stamp.slice(4, 6)) - 1, Number(s.stamp.slice(7, 9)));
      const mon = d.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
      label(ctx, "CAM", r.x + 50, r.y + 40, 40, "#d8ffe0");
      label(ctx, "SP", r.x + r.w - 60, r.y + 40, 30, "#d8ffe0", "mono", "right");
      label(ctx, `-00:${timeFrom(s)}`, r.x + r.w - 50, r.y + 80, 38, "#d8ffe0", "mono", "right");
      label(ctx, `${mon} ${pad(d.getDate())} ${d.getFullYear()}`, r.x + 40, r.y + r.h - 120, 40, "#d8ffe0");
      label(ctx, `PM ${timeFrom(s)}`, r.x + r.w - 60, r.y + r.h - 70, 40, "#d8ffe0", "mono", "right");
    });
  },
  text: { headline: { rotate: 0.157 }, caption: { rotate: 0.157 } },
};

// ---- u11 / u16: Instagram-style music sticker over a full photo --------------------------
function musicSticker(id: TemplateId, name: string, blurb: string, filter: "sepia" | "faded", cover: { x: number; y: number; scale: number }): Template {
  return {
    id,
    name,
    blurb,
    overlayLabel: "Photo tint",
    decorations: decos([["grain", "Grain", true]]),
    cover: { show: true, style: "ig", rotate: 0, ...cover },
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
    redblock,
    covermouth,
    camtilt,
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
