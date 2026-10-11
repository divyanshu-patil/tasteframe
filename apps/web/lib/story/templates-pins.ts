// Layouts from the owner's second pin set (design-refs/pinterest/owner). Green-screen templates
// the owner supplied are keyed by apps/api/scripts/key_template.py; everything else is drawn here.
// Brand UIs (camera makers, streaming apps) are reduced to generic shapes.
import { drawCutout } from "./cutout";
import { type Ctx, drawGrain, drawPhoto, rgba, rng, roundRect } from "./draw";
import { drawScreen } from "./elements";
import { filteredPhoto } from "./filters";
import { type Slots, type Template, decos, fmtDate, on, t } from "./kit";
import { FULL, WHITE, el, fp, label, rot, slotPhoto } from "./templates-refs";
import type { Crop, Rect, StoryState } from "./types";
import { STORY_H as H, STORY_W as W } from "./types";

type Mask = CanvasImageSource & { width: number; height: number };
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function tint(ctx: Ctx, s: StoryState, r: Rect = FULL, mode: GlobalCompositeOperation = "source-over") {
  ctx.save();
  ctx.globalCompositeOperation = mode;
  ctx.fillStyle = rgba(s.overlay.color, s.overlay.strength);
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.restore();
}

// ---- pin 953566921100167968: the owner's app-switcher screenshot (green Story window keyed
// out). Your photo is the Story being posted, black and white like the pin.
const AS_WIN: Rect = { x: 350, y: 221, w: 730, h: 1329 };
const appswitch: Template = {
  id: "appswitch",
  name: "App Switcher",
  blurb: "Your photo as a black-and-white Story being posted, seen in the phone's app switcher.",
  overlayLabel: "Photo tint",
  decorations: [],
  slotRects: () => [AS_WIN],
  defaults: (i) => ({
    headline: t({ text: i.headline, font: "sans", size: 32, color: WHITE, x: 0.662, y: 0.645, width: 0.56, align: "center" }),
    caption: t({ text: "", font: "mono", size: 20, color: WHITE, x: 0.4, y: 0.7 }),
    overlay: { strength: 0.06, color: "#000000" },
    decorations: {},
    filter: "bw",
  }),
  draw(ctx, _p, s, slots) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    slotPhoto(ctx, slots, 0, AS_WIN);
    tint(ctx, s, AS_WIN);
    drawScreen(ctx, "appswitch", W, H);
  },
  text: { headline: { shadow: true } },
};

// ---- pin 955466877203501872: one face split across a pile of old phones on a white wall ----
type Kind = "iphone" | "player" | "nokia" | "black" | "cordless" | "slider" | "camera" | "candybar" | "flip";
interface Device {
  kind: Kind;
  body: Rect;
  r: number;
  screen: Rect;
}
// Positions follow the pin (1080×1440), moved down 240px to centre on the Story.
const dev = (kind: Kind, b: [number, number, number, number], r: number, sc: [number, number, number, number]): Device => ({
  kind,
  body: { x: b[0], y: b[1] + 240, w: b[2] - b[0], h: b[3] - b[1] },
  r,
  screen: { x: sc[0], y: sc[1] + 240, w: sc[2] - sc[0], h: sc[3] - sc[1] },
});
const DEVICES: Device[] = [
  dev("iphone", [138, 160, 690, 438], 44, [197, 177, 630, 415]),
  dev("player", [683, 276, 1003, 428], 22, [707, 303, 841, 404]),
  dev("nokia", [150, 445, 300, 810], 56, [178, 505, 275, 615]),
  dev("black", [322, 440, 735, 638], 26, [365, 448, 697, 630]),
  dev("cordless", [733, 430, 925, 915], 44, [762, 535, 890, 602]),
  dev("slider", [306, 635, 732, 833], 44, [372, 652, 618, 818]),
  dev("camera", [220, 835, 430, 1255], 24, [245, 862, 372, 1035]),
  dev("candybar", [428, 840, 590, 1215], 18, [450, 868, 572, 1100]),
  dev("flip", [597, 835, 745, 1215], 20, [615, 905, 733, 1000]),
];
const PHONES_PHOTO: Rect = { x: 130, y: 400, w: 880, h: 1100 };

function silver(ctx: Ctx, r: Rect) {
  const g = ctx.createLinearGradient(r.x, 0, r.x + r.w, 0);
  g.addColorStop(0, "#9b9ea3");
  g.addColorStop(0.35, "#e8e9eb");
  g.addColorStop(0.7, "#c3c5c9");
  g.addColorStop(1, "#8d9095");
  return g;
}
const BODY: Record<Kind, string | null> = {
  iphone: "#ead6d1",
  player: "#1c1c1e",
  nokia: "#3b3e42",
  black: "#141414",
  cordless: "#4b4d53",
  slider: "#f1f0ec",
  camera: null,
  candybar: null,
  flip: "#121212",
};
function keypad(ctx: Ctx, x: number, y: number, cols: number, rows: number, w: number, h: number, gap: number, color: string) {
  ctx.fillStyle = color;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      roundRect(ctx, { x: x + c * (w + gap), y: y + r * (h + gap * 0.8), w, h }, h / 2.4);
      ctx.fill();
    }
}
function ring(ctx: Ctx, x: number, y: number, r: number, fill: string | CanvasGradient, stroke?: string) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
}
function deviceBody(ctx: Ctx, d: Device) {
  const { body: b, screen: sc } = d;
  ctx.save();
  ctx.shadowColor = "rgba(40,30,25,0.32)";
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = BODY[d.kind] ?? silver(ctx, b);
  roundRect(ctx, b, d.r);
  ctx.fill();
  ctx.restore();
  // Bezel around the screen.
  ctx.fillStyle = d.kind === "iphone" || d.kind === "slider" ? "#fbfaf8" : d.kind === "candybar" ? "#7a1f24" : "#0b0b0b";
  roundRect(ctx, { x: sc.x - 8, y: sc.y - 8, w: sc.w + 16, h: sc.h + 16 }, 10);
  ctx.fill();
  switch (d.kind) {
    case "iphone":
      ring(ctx, b.x + b.w - 30, b.y + b.h / 2, 20, "#fbfaf8", "#cfc7c4");
      ring(ctx, b.x + 32, b.y + b.h / 2, 5, "#333");
      break;
    case "player":
      ring(ctx, b.x + b.w - 78, b.y + b.h / 2, 58, silver(ctx, { x: b.x + b.w - 136, y: 0, w: 116, h: 0 }));
      ring(ctx, b.x + b.w - 78, b.y + b.h / 2, 24, "#2a2a2c");
      break;
    case "nokia":
      label(ctx, "MOBILE", b.x + b.w / 2, b.y + 26, 16, "#c9cdd2", "sans", "center");
      keypad(ctx, b.x + 26, sc.y + sc.h + 40, 3, 4, 26, 20, 12, "#4fa3a6");
      break;
    case "cordless":
      ring(ctx, b.x + b.w / 2, sc.y + sc.h + 70, 30, "#c9cbcf");
      keypad(ctx, b.x + 32, sc.y + sc.h + 120, 3, 4, 34, 24, 14, "#c9a85b");
      break;
    case "slider":
      ctx.fillStyle = "#e3e1dc";
      roundRect(ctx, { x: b.x + b.w - 62, y: b.y + b.h / 2 - 30, w: 34, h: 60 }, 14);
      ctx.fill();
      break;
    case "camera":
      ring(ctx, b.x + b.w - 26, b.y + 52, 16, "#1b1b1b", "#888");
      ring(ctx, b.x + b.w / 2 + 12, b.y + b.h - 105, 62, "#d9dadc", "#8d9095");
      ring(ctx, b.x + b.w / 2 + 12, b.y + b.h - 105, 30, "#a9abaf");
      break;
    case "candybar":
      ring(ctx, b.x + b.w / 2, sc.y + sc.h + 34, 18, "#202020");
      keypad(ctx, b.x + 22, sc.y + sc.h + 60, 3, 2, 34, 16, 8, "#e4e4e4");
      break;
    case "flip":
      ctx.fillStyle = "#1f1f1f";
      ctx.fillRect(b.x + 10, b.y + b.h * 0.55, b.w - 20, 4);
      label(ctx, "Plus", b.x + b.w / 2, b.y + b.h - 70, 22, "#4a7d5a", "italic", "center");
      break;
    case "black":
      ring(ctx, b.x + 20, b.y + b.h / 2, 4, "#2c2c2c");
      break;
  }
}

const phones: Template = {
  id: "phones",
  name: "Old Phones",
  blurb: "One close-up split across a pile of old phones and cameras on a white wall.",
  overlayLabel: "Screen tint",
  decorations: decos([["grain", "Screen grain", true]]),
  slotRects: () => [PHONES_PHOTO],
  defaults: (i) => ({
    headline: t({ text: i.headline, font: "hand", size: 64, color: "#3b3532", x: 0.5, y: 0.8, width: 0.84, align: "center" }),
    caption: t({ text: i.caption || fmtDate(i.date), font: "mono", size: 20, color: "#6c645e", x: 0.5, y: 0.15, width: 0.8, align: "center" }),
    overlay: { strength: 0.14, color: "#f4b8cf" },
    decorations: { grain: true },
    filter: "faded",
  }),
  draw(ctx, _p, s, slots) {
    const wall = ctx.createRadialGradient(W * 0.5, H * 0.42, 100, W * 0.5, H * 0.5, H * 0.75);
    wall.addColorStop(0, "#f1eee9");
    wall.addColorStop(1, "#d8d3cc");
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, W, H);
    for (const d of DEVICES) deviceBody(ctx, d);
    // Every screen shows its piece of the same photo, as if it continued behind the phones.
    ctx.save();
    ctx.beginPath();
    for (const d of DEVICES) ctx.rect(d.screen.x, d.screen.y, d.screen.w, d.screen.h);
    ctx.clip();
    drawPhoto(ctx, slots.photo(0), PHONES_PHOTO, slots.crop(0));
    tint(ctx, s, PHONES_PHOTO, "screen");
    if (on(s, "grain")) drawGrain(ctx, 0.16, 13);
    for (const d of DEVICES) {
      const g = ctx.createLinearGradient(d.screen.x, d.screen.y, d.screen.x + d.screen.w, d.screen.y + d.screen.h);
      g.addColorStop(0, "rgba(255,255,255,0.16)");
      g.addColorStop(0.45, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(d.screen.x, d.screen.y, d.screen.w, d.screen.h);
    }
    ctx.restore();
  },
};

// ---- pin 919789923951050810: a silver digicam across a mirror selfie; its screen is a lyric
// card with the song cover. Chrome stars, a kiss and a marbled paper corner.
const CAM: Rect = { x: -20, y: 600, w: 1120, h: 690 };
const LCD: Rect = { x: 52, y: 770, w: 560, h: 440 };
const CAM_TOP: Rect = { x: 0, y: 0, w: W, h: 945 };
const CAM_BOT: Rect = { x: 0, y: 945, w: W, h: 975 };
function marble(ctx: Ctx) {
  const r = rng(29);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-10, 1450);
  for (let k = 0; k <= 14; k++) ctx.lineTo(k * 24 + r() * 18, 1450 + k * 34 + r() * 26);
  ctx.lineTo(380, H + 10);
  ctx.lineTo(-10, H + 10);
  ctx.closePath();
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 18;
  ctx.fillStyle = "#6e3a22";
  ctx.fill();
  ctx.restore();
  ctx.clip();
  const cols = ["#3a1a10", "#a2643c", "#e2b98e", "#55281a", "#c58452"];
  for (let k = 0; k < 26; k++) {
    ctx.strokeStyle = cols[k % cols.length]!;
    ctx.lineWidth = 4 + r() * 18;
    ctx.beginPath();
    const y = 1440 + k * 20;
    ctx.moveTo(-20, y);
    ctx.bezierCurveTo(90 + r() * 80, y - 60 + r() * 120, 180 + r() * 80, y + 40 - r() * 120, 420, y + r() * 60);
    ctx.stroke();
  }
  ctx.restore();
}
const camlyric: Template = {
  id: "camlyric",
  name: "Camera Lyric",
  blurb: "A silver digicam across your photo; its screen is a lyric card with the song cover.",
  overlayLabel: "Lyric card",
  capacity: 2,
  decorations: decos([["marble", "Marble paper", true]]),
  cover: { show: true, style: "igart", x: (LCD.x + 88) / W, y: (LCD.y + 88) / H, scale: 96 / 300, rotate: 0 },
  stickers: () => [
    el("chromestar", 0.075, 0.345, 230, -12),
    el("chromesparkle", 0.05, 0.668, 180, 8),
    el("chromesparkle", 0.935, 0.675, 210, -10),
    el("kiss", 0.905, 0.343, 150, -6),
  ],
  slotRects: (_s, count) => (count > 1 ? [CAM_TOP, CAM_BOT] : [FULL]),
  defaults: (i) => ({
    headline: t({ text: i.headline, font: "sans", size: 40, color: "#e7a67b", x: (LCD.x + 40) / W, y: (LCD.y + 190) / H, width: (LCD.w - 80) / W }),
    caption: t({ text: "", font: "sans", size: 22, color: "#e7a67b", x: (LCD.x + 40) / W, y: (LCD.y + LCD.h - 66) / H }),
    overlay: { strength: 1, color: "#5b3a29" },
    decorations: { marble: true },
  }),
  draw(ctx, _p, s, slots) {
    if (slots.count > 1) {
      slotPhoto(ctx, slots, 0, CAM_TOP);
      slotPhoto(ctx, slots, 1, CAM_BOT);
    } else drawPhoto(ctx, slots.photo(0), FULL, slots.crop(0));
    if (on(s, "marble")) marble(ctx);
    // Camera body.
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 12;
    ctx.fillStyle = silver(ctx, { x: 0, y: 0, w: W, h: 0 });
    roundRect(ctx, CAM, 46);
    ctx.fill();
    ctx.restore();
    const sheen = ctx.createLinearGradient(0, CAM.y, 0, CAM.y + CAM.h);
    sheen.addColorStop(0, "rgba(255,255,255,0.5)");
    sheen.addColorStop(0.08, "rgba(255,255,255,0)");
    sheen.addColorStop(0.9, "rgba(0,0,0,0)");
    sheen.addColorStop(1, "rgba(0,0,0,0.22)");
    ctx.fillStyle = sheen;
    roundRect(ctx, CAM, 46);
    ctx.fill();
    ctx.fillStyle = "#b9bbbf";
    roundRect(ctx, { x: 640, y: 574, w: 210, h: 40 }, 10);
    ctx.fill();
    ring(ctx, 330, 668, 44, "#2d2d2f", "#9a9ca0");
    ring(ctx, 330, 668, 22, "#111");
    ring(ctx, 420, 652, 10, "#3a3a3a");
    ring(ctx, 420, 684, 10, "#3a3a3a");
    label(ctx, "DIGITAL", 210, 712, 30, "#5d5f63", "sans");
    ["#3d6fb6", "#3d6fb6", "#c0392b", "#c0392b", "#3d6fb6"].forEach((c, k) => {
      ctx.fillStyle = c;
      ctx.fillRect(664 + k * 46, 704, 22, 14);
    });
    // LCD bezel + lyric card.
    ctx.fillStyle = "#9c9ea2";
    roundRect(ctx, { x: LCD.x - 22, y: LCD.y - 22, w: LCD.w + 44, h: LCD.h + 44 }, 18);
    ctx.fill();
    ctx.fillStyle = "#4f5054";
    roundRect(ctx, { x: LCD.x - 8, y: LCD.y - 8, w: LCD.w + 16, h: LCD.h + 16 }, 8);
    ctx.fill();
    ctx.fillStyle = s.overlay.color;
    ctx.fillRect(LCD.x, LCD.y, LCD.w, LCD.h);
    const title = s.cover?.title || "now playing";
    label(ctx, title, LCD.x + 150, LCD.y + 50, 30, "#e7a67b", "sans");
    if (s.cover?.artist) label(ctx, s.cover.artist, LCD.x + 150, LCD.y + 92, 22, "#b98466", "sans");
    label(ctx, "♪ lyrics", LCD.x + 40, LCD.y + LCD.h - 60, 22, "#e7a67b", "sans");
    // Buttons and the control dial.
    const metal = silver(ctx, { x: 620, y: 0, w: 200, h: 0 });
    ring(ctx, 730, 790, 44, metal, "#7d7f84");
    ring(ctx, 730, 975, 118, metal, "#7d7f84");
    ring(ctx, 730, 975, 80, "#c3c5c9", "#8d9095");
    ring(ctx, 730, 975, 44, "#e2e3e5", "#8d9095");
    ring(ctx, 730, 1162, 44, metal, "#7d7f84");
    ring(ctx, 900, 1170, 30, metal, "#7d7f84");
    for (let k = 0; k < 6; k++) ring(ctx, 900 + (k % 3) * 22, 780 + Math.floor(k / 3) * 22, 5, "#55575b");
  },
};

// ---- pin 912401205765506895: the owner's analog film strip (green frames keyed out), four
// tilted frames, sepia like the pin. Frames follow the strip's slight perspective.
const FS = [
  { cx: 807, cy: 199, w: 561, h: 343, a: 13 },
  { cx: 719, cy: 575, w: 573, h: 390, a: 13.5 },
  { cx: 618, cy: 1003, w: 589, h: 452, a: 14.5 },
  { cx: 498, cy: 1489, w: 614, h: 510, a: 15.25 },
];
const filmslant: Template = {
  id: "filmslant",
  name: "Analog Film",
  blurb: "Four tilted frames on a strip of analog film, laid on cream paper, in sepia.",
  overlayLabel: "Warm tone",
  capacity: 4,
  decorations: decos([["grain", "Grain", true]]),
  slotRects: () => FS.map((f) => ({ x: f.cx - f.w * 0.4, y: f.cy - f.h * 0.4, w: f.w * 0.8, h: f.h * 0.8 })),
  defaults: (i) => ({
    headline: t({ text: i.headline, font: "italic", size: 50, color: "#4a3c30", x: 0.05, y: 0.14, width: 0.32 }),
    caption: t({ text: i.caption || fmtDate(i.date), font: "mono", size: 20, color: "#6b5a49", x: 0.05, y: 0.3, width: 0.3 }),
    overlay: { strength: 0.22, color: "#d8b88c" },
    decorations: { grain: true },
    filter: "sepia",
  }),
  draw(ctx, _p, s, slots) {
    ctx.fillStyle = "#e9e1d3";
    ctx.fillRect(0, 0, W, H);
    FS.forEach((f, i) =>
      rot(ctx, f.cx, f.cy, f.a, () => slotPhoto(ctx, slots, i, { x: f.cx - f.w / 2 - 8, y: f.cy - f.h / 2 - 8, w: f.w + 16, h: f.h + 16 })),
    );
    tint(ctx, s, FULL, "multiply");
    if (on(s, "grain")) drawGrain(ctx, 0.1, 47);
    drawScreen(ctx, "filmslant", W, H);
  },
};

// ---- pin 107030928643308232: full-colour photo with one square gone stark black-and-white,
// the song title and artist (editable text) underneath.
const songbox: Template = {
  id: "songbox",
  name: "Song Box",
  blurb: "A square of your photo turned stark black-and-white, with the song name under it.",
  overlayLabel: "Box colour",
  boxFilter: "xerox",
  decorations: [],
  spot: (i) => {
    const f = fp(i);
    return { x: clamp(f.x + 0.04, 0.04, 0.57), y: clamp(f.y - 0.15, 0.14, 0.56), w: 0.39, h: 0.219 };
  },
  defaults: (i) => {
    const f = fp(i);
    const x = clamp(f.x + 0.04, 0.04, 0.57) + 0.195;
    const y = clamp(f.y - 0.15, 0.14, 0.56) + 0.219;
    return {
      headline: t({ text: i.music?.title || i.headline, font: "sans", size: 30, color: WHITE, x, y: y + 0.012, width: 0.5, align: "center" }),
      caption: t({ text: i.music?.artist || i.caption || "", font: "sans", size: 26, color: "#e4e4e4", x, y: y + 0.034, width: 0.5, align: "center" }),
      // Strength 0 = a plain black-and-white box; raise it to tint the box's whites.
      overlay: { strength: 0, color: "#e8475f" },
      decorations: {},
    };
  },
  draw(ctx, _p, s, slots) {
    drawPhoto(ctx, slots.photo(0), FULL, slots.crop(0));
    const sp = s.spot ?? { x: 0.5, y: 0.2, w: 0.39, h: 0.219 };
    const r = { x: sp.x * W, y: sp.y * H, w: sp.w * W, h: sp.h * H };
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    drawPhoto(ctx, filteredPhoto(slots.photo(0), s.boxFilter ?? "xerox"), FULL, slots.crop(0));
    tint(ctx, s, r, "multiply");
    ctx.restore();
  },
  text: { headline: { shadow: true, tracking: 0 }, caption: { shadow: true, tracking: 0 } },
};

// ---- pin 96757091990974969: two stacked outfit shots, fine diagonal lines, a big serif word
// tucked behind you and cute stickers.
const CK_TOP: Rect = { x: 0, y: 0, w: W, h: 954 };
const CK_BOT: Rect = { x: 0, y: 966, w: W, h: 954 };
const clockit: Template = {
  id: "clockit",
  name: "Clock It",
  blurb: "Two stacked outfit shots with fine diagonal lines, a big word behind you and cute stickers.",
  overlayLabel: "Warm tone",
  capacity: 2,
  needsMask: true,
  decorations: decos([["lines", "Diagonal lines", true], ["behind", "Words behind you", true]]),
  stickers: () => [
    el("headcat", 0.13, 0.16, 200, -4),
    el("exclaim", 0.33, 0.07, 140, 6),
    el("owocat", 0.86, 0.43, 180),
    el("anger", 0.24, 0.56, 120),
  ],
  slotRects: () => [CK_TOP, CK_BOT],
  defaults: (i) => ({
    headline: t({ text: i.headline, font: "serif", size: 150, color: "#efe2cc", x: 0.5, y: 0.27, width: 0.96, align: "center" }),
    caption: t({ text: i.caption || "", font: "hand", size: 44, color: "#efe2cc", x: 0.08, y: 0.78, width: 0.8 }),
    overlay: { strength: 0.12, color: "#c89f74" },
    decorations: { lines: true, behind: true },
    filter: "film",
  }),
  draw(ctx, _p, s, slots) {
    ctx.fillStyle = "#1a1612";
    ctx.fillRect(0, 0, W, H);
    slotPhoto(ctx, slots, 0, CK_TOP);
    slotPhoto(ctx, slots, 1, CK_BOT);
    tint(ctx, s);
  },
  front(ctx, s, slots) {
    if (on(s, "behind")) drawCutout(ctx, slots.photo(0), slots.mask(0), CK_TOP, slots.crop(0));
  },
  after(ctx, s) {
    if (!on(s, "lines")) return;
    ctx.save();
    ctx.strokeStyle = "rgba(255,244,228,0.14)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let k = -H; k < W; k += 15) {
      ctx.moveTo(k, H);
      ctx.lineTo(k + H, 0);
    }
    ctx.stroke();
    ctx.restore();
  },
  text: { headline: { fit: true, oneLine: true, tracking: -0.01 }, caption: { shadow: true } },
};

// ---- pin 878553839820182314: white motion lines and yellow sparks drawn around your outline,
// pastel vertical handwriting.
interface Contour {
  cx: number;
  cy: number;
  /** Outer radius (Story px) at each of N angles around the centre. */
  r: number[];
  /** Long-axis angle (radians). */
  axis: number;
}
const N = 90;
const contours = new WeakMap<object, Map<string, Contour | null>>();

/** The person's outer outline as a polar profile, read from the mask at 1/8 scale (cached). */
function contourOf(mask: Mask | null, crop: Crop): Contour | null {
  if (!mask || typeof document === "undefined") return null;
  const key = [crop.zoom, crop.x, crop.y, crop.fit, crop.rot ?? 0].join("|");
  let byKey = contours.get(mask);
  if (!byKey) contours.set(mask, (byKey = new Map()));
  if (byKey.has(key)) return byKey.get(key)!;
  const S = 8;
  const c = document.createElement("canvas");
  c.width = W / S;
  c.height = H / S;
  const g = c.getContext("2d", { willReadFrequently: true });
  let out: Contour | null = null;
  if (g) {
    drawPhoto(g, mask, { x: 0, y: 0, w: c.width, h: c.height }, crop);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < c.width && y < c.height && d[(y * c.width + x) * 4 + 3]! > 128;
    let m = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    for (let y = 0; y < c.height; y++)
      for (let x = 0; x < c.width; x++)
        if (inside(x, y)) {
          m++;
          sx += x;
          sy += y;
          sxx += x * x;
          syy += y * y;
          sxy += x * y;
        }
    if (m > 40) {
      const cx = sx / m;
      const cy = sy / m;
      const axis = 0.5 * Math.atan2(2 * (sxy / m - cx * cy), sxx / m - cx * cx - (syy / m - cy * cy));
      const raw = Array.from({ length: N }, (_, k) => {
        const a = (k / N) * Math.PI * 2;
        let far = 0;
        for (let t = 1; t < 260; t++) {
          const x = Math.round(cx + Math.cos(a) * t);
          const y = Math.round(cy + Math.sin(a) * t);
          if (x < -2 || y < -2 || x > c.width + 2 || y > c.height + 2) break;
          if (inside(x, y)) far = t;
        }
        return far * S;
      });
      const r = raw.map((_, k) => [-3, -2, -1, 0, 1, 2, 3].reduce((acc, o) => acc + raw[(k + o + N) % N]!, 0) / 7);
      out = { cx: cx * S, cy: cy * S, r, axis };
    }
  }
  byKey.set(key, out);
  return out;
}

/** Fallback outline (no mask yet / nobody found): an upright ellipse around the subject. */
function ellipseContour(s: StoryState): Contour {
  const f = s.focus ?? { x: 0.5, y: 0.45 };
  const a = 300;
  const b = 640;
  return {
    cx: f.x * W,
    cy: clamp(f.y * H + 200, 500, 1400),
    axis: Math.PI / 2,
    r: Array.from({ length: N }, (_, k) => {
      const t = (k / N) * Math.PI * 2;
      return (a * b) / Math.hypot(b * Math.cos(t), a * Math.sin(t));
    }),
  };
}

function doodles(ctx: Ctx, s: StoryState, slots: Slots) {
  const c = contourOf(slots.mask(0), slots.crop(0)) ?? ellipseContour(s);
  const radius = (a: number) => {
    const k = ((((a / (Math.PI * 2)) * N) % N) + N) % N;
    const i = Math.floor(k);
    const f = k - i;
    return c.r[i]! * (1 - f) + c.r[(i + 1) % N]! * f;
  };
  const at = (a: number, extra: number) => {
    const r = radius(a) + extra;
    return { x: c.cx + Math.cos(a) * r, y: c.cy + Math.sin(a) * r };
  };
  const deg = Math.PI / 180;
  // Variation 0 is the tidy default; others jitter which stretches get lines, their length,
  // gap and spark side (seeded, so preview and export match).
  const seed = s.seed ?? 0;
  const r = rng(seed * 7919 + 3);
  const vary = seed > 0;
  const span = vary ? 9 + r() * 9 : 13;
  const gap = vary ? 28 + r() * 34 : 40;
  const count = vary ? 3 + Math.floor(r() * 3) : 4;
  // Lines go on the smoothest stretches of the outline (no dents, on the Story), spread out.
  const cands: { a: number; score: number }[] = [];
  for (let d = 0; d < 360; d += 10) {
    const a = c.axis + d * deg;
    const rs = Array.from({ length: 9 }, (_, k) => radius(a + (k - 4) * 3.25 * deg));
    const mean = rs.reduce((x, y) => x + y, 0) / rs.length;
    const ends = [at(a - span * deg, gap + 30), at(a + span * deg, gap + 30)];
    if (mean < 60 || ends.some((p) => p.x < 50 || p.x > W - 50 || p.y < 60 || p.y > H - 60)) continue;
    cands.push({ a, score: (Math.max(...rs) - Math.min(...rs)) / mean + (vary ? r() * 0.5 : 0) });
  }
  const picks: number[] = [];
  for (const { a } of cands.sort((x, y) => x.score - y.score)) {
    const apart = picks.every((b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) > 55 * deg);
    if (apart) picks.push(a);
    if (picks.length === count) break;
  }
  const flip = vary && r() < 0.5 ? 1 : 0;
  ctx.save();
  ctx.globalAlpha = s.overlay.strength;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  picks.forEach((centre, n) => {
    const a0 = centre - span * deg;
    const a1 = centre + span * deg;
    if (on(s, "lines")) {
      ctx.strokeStyle = s.overlay.color;
      ctx.lineWidth = 9;
      ctx.beginPath();
      for (let k = 0; k <= 16; k++) {
        const p = at(a0 + ((a1 - a0) * k) / 16, gap);
        if (k) ctx.lineTo(p.x, p.y);
        else ctx.moveTo(p.x, p.y);
      }
      ctx.stroke();
    }
    if (on(s, "sparks")) {
      // Three short ticks bursting outwards just past one end of the line.
      const a = (n + flip) % 2 ? a1 + 6 * deg : a0 - 6 * deg;
      const base = at(a, gap - 10);
      ctx.strokeStyle = "#f5df4d";
      ctx.lineWidth = 8;
      ctx.beginPath();
      for (const spread of [-28, 0, 28]) {
        const d = a + spread * deg;
        ctx.moveTo(base.x + Math.cos(d) * 14, base.y + Math.sin(d) * 14);
        ctx.lineTo(base.x + Math.cos(d) * 58, base.y + Math.sin(d) * 58);
      }
      ctx.stroke();
    }
  });
  ctx.restore();
}

const doodlefit: Template = {
  id: "doodlefit",
  name: "Basic Fit",
  blurb: "White motion lines and yellow sparks drawn around your outline, pastel vertical words.",
  overlayLabel: "Doodle colour",
  seeded: "Doodle lines",
  needsMask: true,
  decorations: decos([["lines", "Motion lines", true], ["sparks", "Sparks", true]]),
  defaults: (i) => ({
    headline: t({ text: i.headline.toUpperCase(), font: "hand", size: 96, color: "#f4a6dc", x: 0.9, y: 0.16, width: 0.62 }),
    caption: t({ text: (i.caption || "never goes wrong").toUpperCase(), font: "hand", size: 40, color: "#f2e27c", x: 0.805, y: 0.23, width: 0.5 }),
    overlay: { strength: 1, color: "#ffffff" },
    decorations: { lines: true, sparks: true },
  }),
  draw(ctx, _p, s, slots) {
    drawPhoto(ctx, slots.photo(0), FULL, slots.crop(0));
    doodles(ctx, s, slots);
  },
  text: {
    headline: { rotate: Math.PI / 2, tracking: 0.04, fit: true, oneLine: true },
    caption: { rotate: Math.PI / 2, tracking: 0.04, fit: true, oneLine: true },
  },
};

export const PIN_TEMPLATES: Record<string, Template> = Object.fromEntries(
  [appswitch, phones, camlyric, filmslant, songbox, clockit, doodlefit].map((tpl) => [tpl.id, tpl]),
);
