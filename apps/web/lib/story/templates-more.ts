// Second wave of templates, modelled on design-refs/pinterest/{photodump,magazine,nowplaying,
// moodboard,ticket,y2k,tornpaper,notes,newspaper,blurframe}. Vector-drawn; no logos or brands.
import { type Ctx, type Photo, drawBlurred, drawGrain, drawPhoto, fontString, rgba, rng, roundRect, star } from "./draw";
import { type Slots, type Template, decos, fmtDate, on, subjectHigh, subjectLow, t, tornRect } from "./kit";
import type { Rect, StoryState, TemplateId } from "./types";
export type { Slots };
import { STORY_H as H, STORY_W as W } from "./types";

/** Photo clipped to a rounded rect; `shift` nudges the crop so repeated tiles differ. */
export function tile(ctx: Ctx, photo: Photo, r: Rect, base: StoryState["crop"], radius: number, shift = { x: 0, y: 0, zoom: 1 }) {
  ctx.save();
  roundRect(ctx, r, radius);
  ctx.clip();
  const crop = {
    ...base,
    zoom: base.zoom * shift.zoom,
    x: Math.min(1, Math.max(0, base.x + shift.x)),
    y: Math.min(1, Math.max(0, base.y + shift.y)),
  };
  drawPhoto(ctx, photo, r, crop);
  ctx.restore();
}

/** Tile i: its own photo when the Story has one for this slot, else a shifted crop of photo 1. */
export function slotTile(ctx: Ctx, slots: Slots, i: number, r: Rect, radius: number, shift: { x: number; y: number; zoom: number }) {
  if (slots.own(i)) tile(ctx, slots.photo(i), r, slots.crop(i), radius);
  else tile(ctx, slots.photo(0), r, slots.crop(0), radius, shift);
}

function barcode(ctx: Ctx, r: Rect, seed: number, color = "#1d1d1b") {
  const rand = rng(seed);
  ctx.fillStyle = color;
  for (let x = r.x; x < r.x + r.w; ) {
    const w = 2 + Math.floor(rand() * 6);
    if (rand() > 0.35) ctx.fillRect(x, r.y, w, r.h);
    x += w + 2;
  }
}

function hand(ctx: Ctx, text: string, x: number, y: number, size: number, color: string, rot = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.font = fontString("hand", size);
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function doodleArrow(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo((x1 + x2) / 2 + 40, (y1 + y2) / 2 - 50, x2, y2);
  ctx.stroke();
  const a = Math.atan2(y2 - y1, x2 - x1);
  for (const d of [-0.5, 0.5]) {
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - 22 * Math.cos(a + d), y2 - 22 * Math.sin(a + d));
    ctx.stroke();
  }
  ctx.restore();
}

const sparkle = (ctx: Ctx, x: number, y: number, r: number, color = "#ffffff") => {
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = rgba(color, 0.9);
  ctx.shadowBlur = r * 0.8;
  star(ctx, x, y, r, 4, 0.16);
  ctx.fill();
  ctx.restore();
};

const PHOTODUMP_TILES: Rect[] = [
  { x: 70, y: 330, w: 470, h: 560 },
  { x: 565, y: 330, w: 445, h: 330 },
  { x: 565, y: 685, w: 445, h: 520 },
  { x: 70, y: 915, w: 470, h: 290 },
  { x: 70, y: 1230, w: 940, h: 230 },
];

// ---------------------------------------------------------------------------------------------
const photodump: Template = {
  id: "photodump",
  name: "Photo Dump",
  blurb: "Rounded tiles of your moment with doodles and handwritten labels.",
  overlayLabel: "Background",
  decorations: decos([
    ["doodles", "Doodle arrows & labels", true],
    ["hearts", "Little hearts", true],
    ["grain", "Film grain", true],
  ]),
  defaults: (i) => ({
    headline: t({ text: i.headline, size: 52, font: "sans", align: "center", x: 0.5, y: 0.8, width: 0.86, color: "#f4efe6" }),
    caption: t({ text: `here & now · ${fmtDate(i.date)}`, size: 24, font: "mono", x: 0.075, y: 0.135, width: 0.55, color: "#d8d2c8" }),
    overlay: { strength: 0.3, color: "#141312" },
    decorations: { doodles: true, hearts: true, grain: true },
    filter: "film",
  }),
  capacity: 4,
  slotRects: () => PHOTODUMP_TILES.slice(0, 4),
  draw(ctx, _photo, s, slots) {
    ctx.fillStyle = s.overlay.color;
    ctx.fillRect(0, 0, W, H);
    const shifts = [
      { x: 0, y: 0, zoom: 1 }, { x: 0.25, y: -0.2, zoom: 1.6 }, { x: -0.2, y: 0.15, zoom: 1.35 },
      { x: 0.3, y: 0.3, zoom: 1.9 }, { x: -0.1, y: 0.45, zoom: 1.2 },
    ];
    const tiles = PHOTODUMP_TILES.map((r, i) => [r, shifts[i]!] as const);
    tiles.forEach(([r, shift], i) => slotTile(ctx, slots, i, r, 22, shift));
    if (on(s, "doodles")) {
      doodleArrow(ctx, 760, 300, 700, 345, "#f4efe6");
      hand(ctx, "core memory", 775, 288, 40, "#f4efe6", -0.06);
      doodleArrow(ctx, 900, 1300, 960, 1220, "#f4efe6");
      hand(ctx, "again pls", 760, 1330, 38, "#f4efe6", 0.05);
    }
    if (on(s, "hearts")) {
      ctx.fillStyle = "#ffffff";
      for (const [x, y] of [[95, 860], [590, 1180], [590, 635]] as const) {
        ctx.font = fontString("sans", 30);
        ctx.fillText("♥", x, y);
      }
    }
  },
  after: (ctx, s) => on(s, "grain") && drawGrain(ctx, 0.1, 17),
};

// ---------------------------------------------------------------------------------------------
const magazine: Template = {
  id: "magazine",
  name: "Magazine",
  blurb: "A cover: full-bleed photo, giant masthead, cover lines and a barcode.",
  overlayLabel: "Top shade",
  decorations: decos([
    ["coverlines", "Cover lines", true],
    ["barcode", "Barcode", true],
  ]),
  defaults: (i) => {
    const mast = i.headline.split(/\s+/).slice(0, 2).join(" ").toUpperCase() || "ISSUE";
    return {
      headline: t({ text: mast, size: Math.max(96, Math.min(220, 1500 / Math.max(4, mast.length))), font: "display", align: "center", x: 0.5, y: subjectHigh(i) ? 0.6 : 0.135, width: 0.94, color: "#f4efe6" }),
      caption: t({ text: i.caption || "the quiet issue — notes on light, colour and everything in between", size: 34, font: "italic", x: 0.07, y: subjectHigh(i) ? 0.74 : 0.5, width: 0.38, color: "#f4efe6" }),
      overlay: { strength: 0.45, color: "#000000" },
      decorations: { coverlines: true, barcode: true },
    };
  },
  draw(ctx, photo, s) {
    drawPhoto(ctx, photo, { x: 0, y: 0, w: W, h: H }, s.crop);
    const top = s.headline.y < 0.4;
    const g = top ? ctx.createLinearGradient(0, 0, 0, H * 0.45) : ctx.createLinearGradient(0, H, 0, H * 0.45);
    g.addColorStop(0, rgba(s.overlay.color, s.overlay.strength));
    g.addColorStop(1, rgba(s.overlay.color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = "top";
    if (on(s, "coverlines")) {
      ctx.fillStyle = "#f4efe6";
      ctx.font = fontString("mono", 22);
      ctx.fillText(`VOL. 26 · ${s.stamp.replace(/'/g, "")}`, 76, top ? 520 : 260);
      ctx.font = fontString("sans", 40);
      ctx.fillText("THE", 76, top ? 1250 : 1180);
      ctx.fillText("STORY", 76, top ? 1295 : 1225);
      ctx.fillText("ISSUE", 76, top ? 1340 : 1270);
    }
    if (on(s, "barcode")) {
      ctx.fillStyle = "#f4efe6";
      ctx.fillRect(790, 1410, 220, 140);
      barcode(ctx, { x: 805, y: 1422, w: 190, h: 90 }, 26);
      ctx.fillStyle = "#1d1d1b";
      ctx.font = fontString("mono", 16);
      ctx.fillText("LIMITED EDITION", 812, 1522);
    }
  },
  text: { headline: { lineHeight: 0.82, tracking: -0.04, shadow: true }, caption: { shadow: true } },
};

// ---------------------------------------------------------------------------------------------
const nowplaying: Template = {
  id: "nowplaying",
  name: "Now Playing",
  blurb: "A frosted music player: your photo as the album art, the song suggestion as the title.",
  overlayLabel: "Backdrop tint",
  decorations: decos([
    ["controls", "Player controls", true],
    ["volume", "Volume bar", true],
  ]),
  defaults: (i) => ({
    headline: t({ text: i.music?.title ?? i.headline, size: 50, font: "sans", x: 0.2, y: 0.585, width: 0.6, color: "#ffffff", align: "left" }),
    caption: t({ text: i.music?.artist ?? (i.caption || fmtDate(i.date)), size: 34, font: "serif", x: 0.2, y: 0.625, width: 0.6, color: "#d9d4cc" }),
    overlay: { strength: 0.35, color: "#0f0d12" },
    decorations: { controls: true, volume: true },
  }),
  draw(ctx, photo, s) {
    drawBlurred(ctx, photo, { x: 0, y: 0, w: W, h: H }, s.crop);
    ctx.fillStyle = rgba(s.overlay.color, s.overlay.strength);
    ctx.fillRect(0, 0, W, H);
    const card = { x: 150, y: 330, w: 780, h: 1180 };
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 2;
    roundRect(ctx, card, 48);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 40;
    ctx.fillStyle = "#000";
    roundRect(ctx, { x: 210, y: 390, w: 660, h: 660 }, 28);
    ctx.fill();
    ctx.restore();
    tile(ctx, photo, { x: 210, y: 390, w: 660, h: 660 }, s.crop, 28);
    // progress
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    roundRect(ctx, { x: 216, y: 1262, w: 648, h: 8 }, 4);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, { x: 216, y: 1262, w: 270, h: 8 }, 4);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(486, 1266, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = fontString("mono", 20);
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillText("1:24", 216, 1300);
    ctx.textAlign = "right";
    ctx.fillText("-2:31", 864, 1300);
    ctx.textAlign = "left";
    if (on(s, "controls")) {
      ctx.fillStyle = "#ffffff";
      const cy = 1370;
      const tri = (x: number, dir: 1 | -1) => {
        ctx.beginPath();
        ctx.moveTo(x, cy - 22);
        ctx.lineTo(x + dir * 30, cy);
        ctx.lineTo(x, cy + 22);
        ctx.fill();
      };
      tri(375, -1); tri(405, -1); tri(675, 1); tri(705, 1);
      ctx.beginPath();
      ctx.arc(540, cy, 46, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(522, cy - 22, 12, 44);
      ctx.fillRect(546, cy - 22, 12, 44);
    }
    if (on(s, "volume")) {
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.fillRect(266, 1452, 548, 5);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(266, 1452, 330, 5);
    }
  },
};

// ---------------------------------------------------------------------------------------------
const vinyl: Template = {
  id: "vinyl",
  name: "Vinyl",
  blurb: "A record on paper stock with your photo as the label and a tonearm resting on it.",
  overlayLabel: "Paper",
  decorations: decos([
    ["tonearm", "Tonearm", true],
    ["grooves", "Grooves", true],
  ]),
  defaults: (i) => ({
    headline: t({ text: i.music?.title ?? i.headline, size: 76, font: "display", x: 0.08, y: 0.7, width: 0.84 }),
    caption: t({ text: i.music?.artist ? `${i.music.artist} — on repeat` : i.caption || fmtDate(i.date), size: 26, font: "mono", x: 0.08, y: 0.78, width: 0.84, color: "#69645f" }),
    overlay: { strength: 0.25, color: "#efe9df" },
    decorations: { tonearm: true, grooves: true },
  }),
  draw(ctx, photo, s) {
    ctx.fillStyle = s.overlay.color;
    ctx.fillRect(0, 0, W, H);
    drawGrain(ctx, s.overlay.strength * 0.3, 31);
    const cx = 520;
    const cy = 780;
    ctx.fillStyle = "#111111";
    ctx.beginPath();
    ctx.arc(cx, cy, 430, 0, Math.PI * 2);
    ctx.fill();
    if (on(s, "grooves")) {
      ctx.strokeStyle = "rgba(255,255,255,0.07)";
      ctx.lineWidth = 2;
      for (let r = 190; r < 425; r += 9) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      const shine = ctx.createLinearGradient(cx - 430, cy - 430, cx + 430, cy + 430);
      shine.addColorStop(0.35, "rgba(255,255,255,0)");
      shine.addColorStop(0.5, "rgba(255,255,255,0.10)");
      shine.addColorStop(0.65, "rgba(255,255,255,0)");
      ctx.fillStyle = shine;
      ctx.beginPath();
      ctx.arc(cx, cy, 430, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, 175, 0, Math.PI * 2);
    ctx.clip();
    drawPhoto(ctx, photo, { x: cx - 175, y: cy - 175, w: 350, h: 350 }, s.crop);
    ctx.restore();
    ctx.fillStyle = s.overlay.color;
    ctx.beginPath();
    ctx.arc(cx, cy, 10, 0, Math.PI * 2);
    ctx.fill();
    if (on(s, "tonearm")) {
      ctx.save();
      ctx.strokeStyle = "#d8d4cd";
      ctx.lineCap = "round";
      ctx.lineWidth = 18;
      ctx.beginPath();
      ctx.moveTo(960, 330);
      ctx.lineTo(930, 820);
      ctx.lineTo(820, 990);
      ctx.stroke();
      ctx.fillStyle = "#f4f2ee";
      ctx.beginPath();
      ctx.arc(960, 330, 52, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#cfcac2";
      ctx.fillRect(790, 975, 70, 40);
      ctx.restore();
    }
  },
};

// ---------------------------------------------------------------------------------------------
const moodboard: Template = {
  id: "moodboard",
  name: "Mood Board",
  blurb: "A grid of crops with your photo's real colour palette as labelled chips.",
  overlayLabel: "Board",
  decorations: decos([
    ["chips", "Palette chips", true],
    ["rules", "Title rules", true],
  ]),
  defaults: (i) => ({
    headline: t({ text: (i.headline || "mood board").toUpperCase(), size: 84, font: "display", align: "center", x: 0.5, y: 0.13, width: 0.9 }),
    caption: t({ text: i.scene?.length ? i.scene.slice(0, 3).join(" · ") : `mood inspiration · ${fmtDate(i.date)}`, size: 26, font: "serif", align: "center", x: 0.5, y: 0.205, width: 0.8, color: "#69645f" }),
    overlay: { strength: 0.2, color: "#f1efea" },
    decorations: { chips: true, rules: true },
  }),
  capacity: 4,
  slotRects: () => [0, 1, 2, 3].map((k) => ({ x: 90 + (k % 2) * 459, y: 470 + Math.floor(k / 2) * 352, w: 441, h: 334 })),
  draw(ctx, photo, s, slots) {
    ctx.fillStyle = s.overlay.color;
    ctx.fillRect(0, 0, W, H);
    if (on(s, "rules")) {
      ctx.strokeStyle = "#1d1d1b";
      ctx.lineWidth = 2;
      for (const [x1, x2] of [[150, 330], [750, 930]] as const) {
        ctx.beginPath();
        ctx.moveTo(x1, 418);
        ctx.lineTo(x2, 418);
        ctx.stroke();
      }
    }
    const shifts = [
      { x: 0, y: 0, zoom: 1 }, { x: 0.3, y: -0.2, zoom: 1.8 }, { x: -0.25, y: 0.25, zoom: 1.5 },
      { x: 0.2, y: 0.35, zoom: 2.2 }, { x: -0.3, y: -0.3, zoom: 1.3 }, { x: 0.1, y: 0.1, zoom: 2.6 },
    ];
    let k = 0;
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 2; col++) {
        const i = k++;
        slotTile(ctx, slots, i, { x: 90 + col * 459, y: 470 + row * 352, w: 441, h: 334 }, 0, shifts[i]!);
      }
    }
    if (on(s, "chips")) {
      s.palette.slice(0, 4).forEach((c, i) => {
        const y = 560 + i * 220;
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.25)";
        ctx.shadowBlur = 16;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(540, y, 74, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(540, y, 62, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        roundRect(ctx, { x: 470, y: y + 78, w: 140, h: 34 }, 17);
        ctx.fill();
        ctx.fillStyle = "#1d1d1b";
        ctx.font = fontString("mono", 18);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(c.toUpperCase(), 540, y + 95);
        ctx.textAlign = "left";
      });
    }
  },
  text: { headline: { lineHeight: 0.9, tracking: 0.02 } },
};

// ---------------------------------------------------------------------------------------------
const ticket: Template = {
  id: "ticket",
  name: "Ticket",
  blurb: "Your photo above a boarding-pass stub with perforation, seat and barcode.",
  overlayLabel: "Ticket",
  decorations: decos([
    ["flightpath", "Dashed flight path", true],
    ["barcode", "Barcode stub", true],
  ]),
  defaults: (i) => ({
    headline: t({ text: i.headline, size: 66, font: "display", x: 0.12, y: 0.6, width: 0.56 }),
    caption: t({ text: i.caption || fmtDate(i.date), size: 26, font: "mono", x: 0.12, y: 0.735, width: 0.56, color: "#69645f" }),
    overlay: { strength: 1, color: "#fbfaf6" },
    decorations: { flightpath: true, barcode: true },
  }),
  draw(ctx, photo, s) {
    drawPhoto(ctx, photo, { x: 0, y: 0, w: W, h: H }, s.crop);
    if (on(s, "flightpath")) {
      ctx.save();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 5;
      ctx.setLineDash([16, 14]);
      ctx.beginPath();
      ctx.moveTo(140, 760);
      ctx.bezierCurveTo(300, 420, 640, 640, 860, 330);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = "#ffffff";
      ctx.save();
      ctx.translate(880, 300);
      ctx.rotate(-0.6);
      ctx.beginPath();
      ctx.moveTo(0, -36); ctx.lineTo(10, -8); ctx.lineTo(40, 6); ctx.lineTo(40, 14); ctx.lineTo(10, 8);
      ctx.lineTo(8, 30); ctx.lineTo(18, 38); ctx.lineTo(18, 44); ctx.lineTo(0, 38); ctx.lineTo(-18, 44);
      ctx.lineTo(-18, 38); ctx.lineTo(-8, 30); ctx.lineTo(-10, 8); ctx.lineTo(-40, 14); ctx.lineTo(-40, 6);
      ctx.lineTo(-10, -8); ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    const r = { x: 90, y: 1080, w: 900, h: 470 };
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.3)";
    ctx.shadowBlur = 30;
    ctx.fillStyle = s.overlay.color;
    roundRect(ctx, r, 26);
    ctx.fill();
    ctx.restore();
    // Perforation between the main ticket and the stub.
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(760, r.y, 22, 0, Math.PI * 2);
    ctx.arc(760, r.y + r.h, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = "#bdb6ad";
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(760, r.y + 30);
    ctx.lineTo(760, r.y + r.h - 30);
    ctx.stroke();
    ctx.setLineDash([]);
    const rand = rng(Number(s.stamp.replace(/\D/g, "")) || 7);
    const seat = `${10 + Math.floor(rand() * 20)}${"ABCDEF"[Math.floor(rand() * 6)]}`;
    ctx.fillStyle = "#69645f";
    ctx.font = fontString("mono", 20);
    ctx.textBaseline = "top";
    ctx.fillText("BOARDING PASS · ONE WAY", 130, r.y + 36);
    ctx.fillText(`GATE ${1 + Math.floor(rand() * 30)}    SEAT ${seat}    ${s.stamp.replace(/'/g, "")}`, 130, r.y + 400);
    if (on(s, "barcode")) {
      ctx.save();
      ctx.translate(875, r.y + 60);
      ctx.rotate(Math.PI / 2);
      barcode(ctx, { x: 0, y: -70, w: 350, h: 140 }, 4242);
      ctx.restore();
    }
  },
};

// ---------------------------------------------------------------------------------------------
const y2k: Template = {
  id: "y2k",
  name: "Y2K Chrome",
  blurb: "Dark chrome: a silver-edged frame, four-point sparkles and glitter.",
  overlayLabel: "Background",
  decorations: decos([
    ["sparkles", "Sparkles", true],
    ["glitter", "Glitter specks", true],
  ]),
  defaults: (i) => ({
    headline: t({ text: i.headline, size: 92, font: "display", align: "center", x: 0.5, y: 0.71, width: 0.86, color: "#eceaf4" }),
    caption: t({ text: i.caption || fmtDate(i.date), size: 24, font: "mono", align: "center", x: 0.5, y: 0.785, width: 0.8, color: "#b9b6c8" }),
    overlay: { strength: 1, color: "#09090d" },
    decorations: { sparkles: true, glitter: true },
    filter: "vivid",
  }),
  draw(ctx, photo, s) {
    ctx.fillStyle = s.overlay.color;
    ctx.fillRect(0, 0, W, H);
    const r = { x: 170, y: 330, w: 740, h: 950 };
    const chrome = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
    chrome.addColorStop(0, "#f8f8fb");
    chrome.addColorStop(0.3, "#8a8a96");
    chrome.addColorStop(0.5, "#ffffff");
    chrome.addColorStop(0.75, "#6d6d78");
    chrome.addColorStop(1, "#e9e9ef");
    ctx.fillStyle = chrome;
    roundRect(ctx, { x: r.x - 16, y: r.y - 16, w: r.w + 32, h: r.h + 32 }, 64);
    ctx.fill();
    tile(ctx, photo, r, s.crop, 50);
    if (on(s, "glitter")) {
      const rand = rng(99);
      for (let i = 0; i < 140; i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.2 + rand() * 0.6})`;
        ctx.fillRect(rand() * W, rand() * H, 2 + rand() * 3, 2 + rand() * 3);
      }
    }
    if (on(s, "sparkles")) {
      for (const [x, y, rr] of [[150, 300, 70], [930, 1240, 90], [880, 250, 34], [120, 1330, 40], [960, 760, 26]] as const) {
        sparkle(ctx, x, y, rr);
      }
    }
  },
  text: { headline: { shadow: true, tracking: -0.02 } },
};

// ---------------------------------------------------------------------------------------------
const torn: Template = {
  id: "torn",
  name: "Torn Reveal",
  blurb: "Your photo through a torn paper strip, with typewriter label tapes.",
  overlayLabel: "Paper",
  decorations: decos([
    ["labels", "Label tapes", true],
    ["daisy", "Pressed daisy", true],
  ]),
  defaults: (i) => ({
    headline: t({ text: i.headline, size: 30, font: "mono", x: 0.1, y: 0.25, width: 0.8 }),
    caption: t({ text: i.caption || "so better things can fall together.", size: 26, font: "mono", align: "right", x: 0.9, y: 0.71, width: 0.8 }),
    overlay: { strength: 0.3, color: "#ece4d6" },
    decorations: { labels: true, daisy: true },
    filter: "film",
  }),
  draw(ctx, photo, s) {
    ctx.fillStyle = s.overlay.color;
    ctx.fillRect(0, 0, W, H);
    drawGrain(ctx, s.overlay.strength * 0.4, 23);
    const top = 560;
    const bottom = 1300;
    const rand = rng(77);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, top);
    for (let x = 0; x <= W; x += 22) ctx.lineTo(x, top + (rand() - 0.5) * 34);
    ctx.lineTo(W, bottom);
    for (let x = W; x >= 0; x -= 22) ctx.lineTo(x, bottom + (rand() - 0.5) * 34);
    ctx.closePath();
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 24;
    ctx.fillStyle = "#000";
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.clip();
    drawPhoto(ctx, photo, { x: 0, y: top - 30, w: W, h: bottom - top + 60 }, s.crop);
    ctx.restore();
    if (on(s, "labels")) {
      for (const layer of [s.headline, s.caption]) {
        if (!layer.text.trim()) continue;
        ctx.font = fontString("mono", layer.size);
        const w = Math.min(layer.width * W, ctx.measureText(layer.text).width) + 36;
        const x = layer.align === "right" ? layer.x * W - w + 18 : layer.align === "center" ? layer.x * W - w / 2 : layer.x * W - 18;
        ctx.fillStyle = "#f4ead8";
        ctx.fillRect(x, layer.y * H - 14, w, layer.size * 1.2 + 28);
      }
    }
    if (on(s, "daisy")) {
      ctx.save();
      ctx.translate(930, 610);
      for (let i = 0; i < 14; i++) {
        ctx.rotate((Math.PI * 2) / 14);
        ctx.fillStyle = "#f7f3e8";
        ctx.beginPath();
        ctx.ellipse(0, -34, 9, 34, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#e7b416";
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  },
};

// ---------------------------------------------------------------------------------------------
const note: Template = {
  id: "note",
  name: "Paper Note",
  blurb: "A torn-edge note pinned over your photo, written by hand.",
  overlayLabel: "Photo tint",
  decorations: decos([
    ["pin", "Push pin", true],
    ["flower", "Pressed flower", true],
  ]),
  defaults: (i) => ({
    headline: t({ text: i.headline, size: 74, font: "hand", align: "center", x: 0.5, y: subjectHigh(i) ? 0.56 : 0.38, width: 0.6 }),
    caption: t({ text: i.caption || "there is beauty in small things ♡", size: 44, font: "hand", align: "center", x: 0.5, y: subjectHigh(i) ? 0.66 : 0.48, width: 0.6, color: "#4a443e" }),
    overlay: { strength: 0.2, color: "#000000" },
    decorations: { pin: true, flower: true },
  }),
  draw(ctx, photo, s) {
    drawPhoto(ctx, photo, { x: 0, y: 0, w: W, h: H }, s.crop);
    ctx.fillStyle = rgba(s.overlay.color, s.overlay.strength);
    ctx.fillRect(0, 0, W, H);
    const cy = (s.headline.y + 0.05) * H;
    const r = { x: 180, y: cy - 190, w: 720, h: 470 };
    ctx.save();
    ctx.translate(540, cy);
    ctx.rotate(-0.025);
    ctx.translate(-540, -cy);
    ctx.shadowColor = "rgba(0,0,0,0.3)";
    ctx.shadowBlur = 26;
    ctx.fillStyle = "#f6f0e2";
    tornRect(ctx, r, 5);
    ctx.fill();
    ctx.restore();
    if (on(s, "pin")) {
      ctx.fillStyle = "#c0392b";
      ctx.beginPath();
      ctx.arc(820, r.y + 24, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.beginPath();
      ctx.arc(812, r.y + 15, 8, 0, Math.PI * 2);
      ctx.fill();
    }
    if (on(s, "flower")) {
      ctx.save();
      ctx.translate(232, r.y + r.h - 30);
      for (let i = 0; i < 5; i++) {
        ctx.rotate((Math.PI * 2) / 5);
        ctx.fillStyle = "#7d9bd1";
        ctx.beginPath();
        ctx.ellipse(0, -30, 16, 30, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#f2d16b";
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  },
  text: { headline: { rotate: -0.025, lineHeight: 1 }, caption: { rotate: -0.025, lineHeight: 1.05 } },
};

// ---------------------------------------------------------------------------------------------
const newspaper: Template = {
  id: "newspaper",
  name: "Newspaper",
  blurb: "Front page: masthead, issue line, column rules, a pull quote and your photo.",
  overlayLabel: "Newsprint",
  decorations: decos([
    ["columns", "Text columns", true],
    ["rules", "Rules", true],
  ]),
  defaults: (i) => ({
    headline: t({ text: (i.headline || "the daily").toUpperCase(), size: 100, font: "display", align: "center", x: 0.5, y: 0.135, width: 0.92 }),
    caption: t({ text: `“${i.caption || "a small story, worth printing."}”`, size: 42, font: "italic", x: 0.075, y: 0.3, width: 0.42 }),
    overlay: { strength: 0.3, color: "#e9e5dc" },
    decorations: { columns: true, rules: true },
    filter: "bw",
  }),
  draw(ctx, photo, s) {
    ctx.fillStyle = s.overlay.color;
    ctx.fillRect(0, 0, W, H);
    drawGrain(ctx, s.overlay.strength * 0.35, 41);
    ctx.fillStyle = "#1d1d1b";
    if (on(s, "rules")) {
      ctx.fillRect(70, 245, 940, 3);
      ctx.fillRect(70, 410, 940, 3);
      ctx.fillRect(70, 418, 940, 1);
    }
    ctx.font = fontString("mono", 20);
    ctx.textBaseline = "top";
    const d = s.stamp.replace(/'/g, "");
    ctx.fillText(`ISSUE ${d.replace(/\s/g, "")} · EVENING EDITION`, 76, 210);
    ctx.textAlign = "right";
    ctx.fillText("PRICE: ONE STORY", 1004, 210);
    ctx.textAlign = "left";
    const photoR = { x: 560, y: 470, w: 450, h: 1000 };
    drawPhoto(ctx, photo, photoR, s.crop);
    ctx.strokeStyle = "#1d1d1b";
    ctx.lineWidth = 2;
    ctx.strokeRect(photoR.x, photoR.y, photoR.w, photoR.h);
    if (on(s, "columns")) {
      const rand = rng(12);
      ctx.fillStyle = "rgba(29,29,27,0.38)";
      for (let y = 900; y < 1470; y += 26) {
        const w = 230 + rand() * 210;
        ctx.fillRect(80, y, rand() > 0.9 ? w * 0.4 : w, 9);
      }
      ctx.fillStyle = "#1d1d1b";
      ctx.font = fontString("sans", 30);
      ctx.fillText("IN TODAY'S EDITION", 80, 840);
    }
  },
  text: { headline: { lineHeight: 0.88, tracking: -0.02 }, caption: { lineHeight: 1.15 } },
};

// ---------------------------------------------------------------------------------------------
const softfocus: Template = {
  id: "softfocus",
  name: "Soft Focus",
  blurb: "A dreamy blurred backdrop with your sharp photo inset in a fine frame.",
  overlayLabel: "Haze",
  decorations: decos([
    ["border", "Fine border", true],
    ["grain", "Grain", true],
  ]),
  defaults: (i) => ({
    headline: t({ text: i.headline, size: 64, font: "italic", align: "center", x: 0.5, y: subjectLow(i) ? 0.75 : 0.155, width: 0.8, color: "#ffffff" }),
    caption: t({ text: i.caption || fmtDate(i.date), size: 26, font: "serif", align: "center", x: 0.5, y: subjectLow(i) ? 0.795 : 0.73, width: 0.8, color: "#ffffff" }),
    overlay: { strength: 0.15, color: "#ffffff" },
    decorations: { border: true, grain: true },
    filter: "faded",
  }),
  draw(ctx, photo, s) {
    drawBlurred(ctx, photo, { x: 0, y: 0, w: W, h: H }, s.crop);
    ctx.fillStyle = rgba(s.overlay.color, s.overlay.strength);
    ctx.fillRect(0, 0, W, H);
    const r = { x: 210, y: 390, w: 660, h: 960 };
    drawPhoto(ctx, photo, r, s.crop);
    if (on(s, "border")) {
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 4;
      ctx.strokeRect(r.x - 14, r.y - 14, r.w + 28, r.h + 28);
    }
  },
  after: (ctx, s) => on(s, "grain") && drawGrain(ctx, 0.08, 51),
  text: { headline: { shadow: true }, caption: { shadow: true } },
};

export const MORE_TEMPLATES: Record<
  Extract<TemplateId, "photodump" | "magazine" | "nowplaying" | "vinyl" | "moodboard" | "ticket" | "y2k" | "torn" | "note" | "newspaper" | "softfocus">,
  Template
> = { photodump, magazine, nowplaying, vinyl, moodboard, ticket, y2k, torn, note, newspaper, softfocus };
