// Layouts from the owner's third pin set (pins 1110770695656757194/198/202/203), measured from
// the references and scaled to 1080×1920. Flowers are the owner-supplied photographic PNGs
// (elements.ts); phone UI text uses the system font so it renders like the screenshot on iOS.
// Brand marks (streaming apps) become generic shapes.
import { type Ctx, type Photo, drawPhoto, rgba, roundRect } from "./draw";
import { rotatedPhoto } from "./filters";
import { type Slots, type Template, boxAt, decos, on, t } from "./kit";
import { WHITE, el, slotPhoto } from "./templates-refs";
import type { Rect } from "./types";
import { STORY_H as H, STORY_W as W } from "./types";

const UI_FONT = `-apple-system, "SF Pro Text", "Helvetica Neue", Arimo, Helvetica, Arial, sans-serif`;
const ui = (ctx: Ctx, weight: number, size: number) => (ctx.font = `${weight} ${Math.round(size)}px ${UI_FONT}`);

/** Slot i, or (no photo of yours there) photo 1 with the same framing — like the pins, which
 * repeat one photo — still adjustable on its own (views[key]). */
function sameOrOwn(ctx: Ctx, slots: Slots, i: number, r: Rect, turn = 0) {
  const over = turn ? (p: Photo) => rotatedPhoto(p, turn) : undefined;
  if (slots.own(i)) return slotPhoto(ctx, slots, i, r, 0, over);
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  const src = slots.photo(0);
  drawPhoto(ctx, over ? over(src) : src, r, slots.adjust(`slot${i}`, slots.crop(0)));
  ctx.restore();
}

// ---- pin 1110770695656757198: two bands of your photo, a black band between with a mauve
// lyric card and a large dark lily; small lily clusters at the band edges.
const LL_TOP: Rect = { x: 0, y: 0, w: W, h: 638 };
const LL_BAND: Rect = { x: 0, y: 638, w: W, h: 640 };
const LL_BOT: Rect = { x: 0, y: 1278, w: W, h: 642 };
const LL_CARD: Rect = { x: 70, y: 731, w: 467, h: 470 };
const lyriclily: Template = {
  id: "lyriclily",
  name: "Lyric Lily",
  blurb: "Your photo above and below a black band: a lyric card for your song beside a dark lily.",
  overlayLabel: "Card colour",
  capacity: 2,
  decorations: decos([["brand", "Card footer", true]]),
  cover: { show: true, style: "igart", x: (93 + 21) / W, y: (753 + 21) / H, scale: 42 / 300, rotate: 0 },
  stickers: () => [
    el("lilydark", 0.716, 0.483, 640, -4),
    el("lilydark2", 0.07, 0.342, 150, 18),
    el("lilydark", 0.16, 0.336, 120, -24),
    el("lilydark2", 0.86, 0.637, 150, -12),
    el("lilydark", 0.95, 0.646, 120, 20),
  ],
  slotRects: () => [LL_TOP, LL_BOT],
  defaults: (i) => ({
    headline: t({ text: i.headline, font: "sans", size: 48, color: WHITE, x: 93 / W, y: 840 / H, width: 405 / W }),
    caption: t({ text: i.music?.artist ? `Song · ${i.music.artist}` : "", font: "sans", size: 15, color: "#dcc9c7", x: 144 / W, y: 783 / H, width: 360 / W }),
    overlay: { strength: 1, color: "#6c3d3a" },
    decorations: { brand: true },
  }),
  draw(ctx, _p, s, slots) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    sameOrOwn(ctx, slots, 0, LL_TOP);
    sameOrOwn(ctx, slots, 1, LL_BOT);
    ctx.fillStyle = "#000";
    ctx.fillRect(LL_BAND.x, LL_BAND.y, LL_BAND.w, LL_BAND.h);
    ctx.fillStyle = s.overlay.color;
    roundRect(ctx, LL_CARD, 15);
    ctx.fill();
    ui(ctx, 700, 16);
    ctx.fillStyle = WHITE;
    ctx.textBaseline = "top";
    ctx.fillText(s.cover?.title || "now playing", 144, 761, 360);
    if (on(s, "brand")) {
      // Generic footer (no streaming-app logo): a round note badge and "Lyrics".
      ctx.fillStyle = WHITE;
      ctx.beginPath();
      ctx.arc(104, 1166, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = s.overlay.color;
      ui(ctx, 700, 15);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("♪", 104, 1167);
      ctx.textAlign = "left";
      ctx.fillStyle = WHITE;
      ui(ctx, 700, 17);
      ctx.fillText("Lyrics", 122, 1167);
    }
  },
  text: { headline: { tracking: -0.01, lineHeight: 1.19 }, caption: { tracking: 0 } },
};

// ---- pin 1110770695656757203: the phone's photo editor on black — your photo as the Live
// preview with a small caption, the "Make Key Photo" tip, frame scrubber and toolbar.
const KP_PHOTO: Rect = { x: 32, y: 314, w: 1014, h: 757 };
const KP_BAR: Rect = { x: 29, y: 1260, w: 1005, h: 138 };
function liveIcon(ctx: Ctx, cx: number, cy: number) {
  ctx.save();
  ctx.strokeStyle = WHITE;
  ctx.fillStyle = WHITE;
  ctx.lineWidth = 2.5;
  for (let k = 0; k < 28; k++) {
    const a = (k / 28) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * 33, cy + Math.sin(a) * 33, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(cx, cy, 22, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
function adjustIcon(ctx: Ctx, cx: number, cy: number, c: string) {
  ctx.save();
  ctx.strokeStyle = c;
  ctx.fillStyle = c;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, 24, 0, Math.PI * 2);
  ctx.stroke();
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 30, cy + Math.sin(a) * 30);
    ctx.lineTo(cx + Math.cos(a) * 35, cy + Math.sin(a) * 35);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(cx, cy - 11, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
function filtersIcon(ctx: Ctx, cx: number, cy: number, c: string) {
  ctx.save();
  ctx.strokeStyle = c;
  ctx.lineWidth = 3;
  for (const [dx, dy] of [[0, -9], [-9, 7], [9, 7]] as const) {
    ctx.beginPath();
    ctx.arc(cx + dx, cy + dy, 16, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}
function cropIcon(ctx: Ctx, cx: number, cy: number, c: string) {
  ctx.save();
  ctx.strokeStyle = c;
  ctx.lineWidth = 3.5;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(cx - 16, cy - 30);
  ctx.lineTo(cx - 16, cy + 16);
  ctx.lineTo(cx + 30, cy + 16);
  ctx.moveTo(cx - 30, cy - 16);
  ctx.lineTo(cx + 16, cy - 16);
  ctx.lineTo(cx + 16, cy + 30);
  ctx.stroke();
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx + 24, cy - 24, 9, Math.PI * 1.1, Math.PI * 1.9);
  ctx.stroke();
  ctx.restore();
}
const keyphoto: Template = {
  id: "keyphoto",
  name: "Key Photo",
  blurb: "Your photo open in the phone's photo editor: Live view, frame scrubber and a small caption.",
  overlayLabel: "Photo tint",
  decorations: decos([["tip", "“Make Key Photo” tip", true], ["frames", "Frame scrubber", true], ["tools", "Toolbar", true]]),
  slotRects: () => [KP_PHOTO],
  defaults: (i) => ({
    headline: t({ text: i.headline, font: "serif", family: "Arimo", size: 31, color: WHITE, x: 107 / W, y: 562 / H, width: 172 / W }),
    caption: t({ text: "", font: "serif", family: "Arimo", size: 24, color: WHITE, x: 107 / W, y: 700 / H, width: 300 / W }),
    overlay: { strength: 0, color: "#000000" },
    decorations: { tip: true, frames: true, tools: true },
  }),
  draw(ctx, _p, s, slots) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    sameOrOwn(ctx, slots, 0, KP_PHOTO);
    ctx.fillStyle = rgba(s.overlay.color, s.overlay.strength);
    ctx.fillRect(KP_PHOTO.x, KP_PHOTO.y, KP_PHOTO.w, KP_PHOTO.h);
    ctx.textBaseline = "middle";
    if (on(s, "tip")) {
      ctx.fillStyle = "#2c2c2e";
      roundRect(ctx, { x: 41, y: 1100, w: 406, h: 123 }, 30);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(146, 1220);
      ctx.lineTo(168, 1246);
      ctx.lineTo(190, 1220);
      ctx.fill();
      ui(ctx, 400, 41);
      ctx.fillStyle = WHITE;
      ctx.fillText("Make Key Photo", 75, 1162);
      ctx.beginPath();
      ctx.arc(512, 1235, 9, 0, Math.PI * 2);
      ctx.fill();
    }
    if (on(s, "frames")) {
      ctx.fillStyle = "rgba(142,142,147,0.62)";
      roundRect(ctx, KP_BAR, 12);
      ctx.fill();
      ui(ctx, 300, 64);
      ctx.fillStyle = WHITE;
      ctx.textAlign = "center";
      ctx.fillText("‹", 55, 1324);
      ctx.fillText("›", 1008, 1324);
      ctx.textAlign = "left";
      const first: Rect = { x: 81, y: 1268, w: 185, h: 124 };
      const rest = (992 - first.x - first.w) / 5;
      const frames = [first, ...Array.from({ length: 5 }, (_, k) => ({ x: first.x + first.w + k * rest, y: 1272, w: rest, h: 116 }))];
      frames.forEach((r, k) => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(r.x, r.y, r.w, r.h);
        ctx.clip();
        // Live frames: the same moment, nudged a touch frame to frame.
        const c = slots.crop(0);
        drawPhoto(ctx, slots.photo(0), r, { ...c, x: Math.min(1, Math.max(0, c.x + (k - 2) * 0.01)) });
        ctx.restore();
      });
      ctx.strokeStyle = WHITE;
      ctx.lineWidth = 5;
      roundRect(ctx, { x: first.x - 2, y: first.y - 2, w: first.w + 4, h: first.h + 4 }, 8);
      ctx.stroke();
    }
    if (on(s, "tools")) {
      ctx.fillStyle = "#f5c518";
      ctx.beginPath();
      ctx.moveTo(281, 1443);
      ctx.lineTo(303, 1443);
      ctx.lineTo(292, 1458);
      ctx.fill();
      const grey = "#8e8e93";
      liveIcon(ctx, 289, 1517);
      adjustIcon(ctx, 450, 1517, grey);
      filtersIcon(ctx, 612, 1517, grey);
      cropIcon(ctx, 773, 1517, grey);
      ui(ctx, 600, 23);
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      [["Live", 289, WHITE], ["Adjust", 450, grey], ["Filters", 612, grey], ["Crop", 773, grey]].forEach(([txt, x, c]) => {
        ctx.fillStyle = c as string;
        ctx.fillText(txt as string, x as number, 1562);
      });
      ctx.textAlign = "left";
    }
  },
  text: { headline: { tracking: 0, lineHeight: 1.04 }, caption: { tracking: 0 } },
};

// ---- pin 1110770695656757202: a sideways two-photo Story (top turned clockwise, bottom
// anticlockwise) with an upright square inset, the song's album-art sticker, chrome stars,
// red hearts and lips, a black eye bar and a music-code bar.
const SC_TOP: Rect = { x: 0, y: 0, w: W, h: 955 };
const SC_BOT: Rect = { x: 0, y: 955, w: W, h: 965 };
const SC_INSET: Rect = { x: 81, y: 770, w: 349, h: 349 };
const SC_EYES: Rect = { x: 248, y: 1357, w: 20, h: 191 };
function musicCode(ctx: Ctx, r: Rect) {
  ctx.save();
  ctx.fillStyle = "#000";
  roundRect(ctx, r, 10);
  ctx.fill();
  const cy = r.y + r.h / 2;
  ctx.fillStyle = WHITE;
  ctx.beginPath();
  ctx.arc(r.x + 40, cy, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#000";
  ui(ctx, 700, 28);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("♪", r.x + 40, cy + 1);
  // Bars of varying height, like a scannable music code.
  const heights = [0.3, 0.55, 0.35, 0.8, 0.45, 0.65, 0.3, 0.9, 0.5, 0.35, 0.7, 0.4, 0.6, 0.3, 0.85, 0.45, 0.55, 0.3, 0.75, 0.4, 0.5, 0.3, 0.6];
  ctx.fillStyle = WHITE;
  const x0 = r.x + 80;
  const step = (r.w - 100) / heights.length;
  heights.forEach((v, k) => {
    const h = r.h * 0.7 * v;
    roundRect(ctx, { x: x0 + k * step, y: cy - h / 2, w: step * 0.55, h }, step * 0.27);
    ctx.fill();
  });
  ctx.restore();
}
const sidecollage: Template = {
  id: "sidecollage",
  name: "Sideways Collage",
  blurb: "Two sideways photos with an upright inset, your song's album art, chrome stars, hearts and lips.",
  overlayLabel: "Photo tint",
  capacity: 3,
  decorations: decos([["eyes", "Eye bar", true], ["code", "Music code", true]]),
  // Album art only; its title/artist below are the headline/caption (editable, like the pin).
  cover: { show: true, style: "igart", x: 632 / 736, y: 443 / 1307, scale: (120 * 1.4674) / 300, rotate: 0 },
  boxes: (s) => (on(s, "eyes") ? [{ key: "eyes", label: "Eye bar", r: SC_EYES }] : []),
  stickers: () => [
    el("chromestar", 0.269, 0.034, 66, -10),
    el("chromestar", 0.31, 0.029, 50, 14),
    { ...el("heart", 0.765, 0.09, 59, -15), color: "#d7262e" },
    { ...el("heart", 0.834, 0.115, 41, 10), color: "#d7262e" },
    { ...el("heart", 0.4, 0.386, 35, -8), color: "#d7262e" },
    { ...el("heart", 0.85, 0.451, 44, 15), color: "#d7262e" },
    { ...el("heart", 0.141, 0.848, 38, -12), color: "#d7262e" },
    { ...el("heart", 0.806, 0.95, 41, 8), color: "#d7262e" },
    el("kissblur", 0.249, 0.272, 90, 80),
    el("sparkle", 0.065, 0.407, 150, 0, WHITE),
    el("chromesparkle", 0.582, 0.366, 130, 0),
    el("sparkle", 0.4375, 0.5625, 130, 12, "#111111"),
    el("kiss", 0.595, 0.528, 94, -4),
  ],
  slotRects: () => [SC_TOP, SC_BOT, SC_INSET],
  defaults: (i) => ({
    headline: t({ text: i.music?.title || i.headline, font: "sans", size: 19, color: WHITE, x: 632 / 736, y: 0.388, width: 0.26, align: "center" }),
    caption: t({ text: i.music?.artist?.toUpperCase() || "", font: "serif", family: "Arimo", size: 16, color: WHITE, x: 632 / 736, y: 0.401, width: 0.26, align: "center" }),
    overlay: { strength: 0, color: "#000000" },
    decorations: { eyes: true, code: true },
  }),
  draw(ctx, _p, s, slots) {
    ctx.fillStyle = "#d8d6d4";
    ctx.fillRect(0, 0, W, H);
    sameOrOwn(ctx, slots, 0, SC_TOP, 90);
    sameOrOwn(ctx, slots, 1, SC_BOT, 270);
    ctx.fillStyle = rgba(s.overlay.color, s.overlay.strength);
    ctx.fillRect(0, 0, W, H);
    if (on(s, "eyes")) {
      const r = boxAt(s, "eyes", SC_EYES);
      ctx.fillStyle = "#050505";
      roundRect(ctx, r, Math.min(r.w, r.h) / 2);
      ctx.fill();
    }
    slotPhoto(ctx, slots, 2, SC_INSET);
    if (on(s, "code")) musicCode(ctx, { x: 59, y: 1774, w: 334, h: 82 });
  },
  text: { headline: { tracking: 0, oneLine: true, fit: true }, caption: { tracking: 0.02, oneLine: true, fit: true } },
};

export const PIN2_TEMPLATES: Record<string, Template> = Object.fromEntries(
  [lyriclily, keyphoto, sidecollage].map((tpl) => [tpl.id, tpl]),
);
