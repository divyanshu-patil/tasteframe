// Layouts from the owner's third pin set (pins 1110770695656757194/198/202/203), measured from
// the references and scaled to 1080×1920. Flowers are the owner-supplied photographic PNGs
// (elements.ts); phone UI text uses the system font so it renders like the screenshot on iOS.
// Brand marks (streaming apps) become generic shapes.
import { type Ctx, type Photo, drawBlurred, drawPhoto, rgba, roundRect } from "./draw";
import { filteredPhoto, rotatedPhoto } from "./filters";
import { type Slots, type Template, boxAt, decos, on, t } from "./kit";
import { WHITE, el, slotPhoto } from "./templates-refs";
import type { Rect, StoryState } from "./types";
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

// ---- Date bits from the Story's stamp ("'YY MM DD").
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function stampParts(s: StoryState) {
  const [yy = "00", mm = "01", dd = "01"] = s.stamp.replace("'", "").split(" ");
  return { yy, mm, dd, month: MONTHS[Math.max(0, Math.min(11, Number(mm) - 1))]! };
}
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Text at fixed spots (decorative labels the pins carry), system font. */
function uiText(ctx: Ctx, text: string, x: number, y: number, size: number, color: string, weight = 600, align: CanvasTextAlign = "left", lh = 1.2) {
  ctx.save();
  ui(ctx, weight, size);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  text.split("\n").forEach((l, i) => ctx.fillText(l, x, y + i * size * lh));
  ctx.restore();
}

// ---- pin 1900024840094743: a day's recap — nine photo tiles in a 3×3 grid over your full
// photo, script title, round date badge and a caption line.
const TG_COLS = [200, 437, 674];
const TG_ROWS = [517, 814, 1111];
const TG_TILE = { w: 228, h: 288 };
const tgTile = (k: number): Rect => ({ x: TG_COLS[k % 3]!, y: TG_ROWS[Math.floor(k / 3)]!, ...TG_TILE });
function circleText(ctx: Ctx, text: string, cx: number, cy: number, r: number, size: number) {
  ctx.save();
  ui(ctx, 700, size);
  ctx.fillStyle = WHITE;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const chars = [...text];
  const step = (Math.PI * 2) / chars.length;
  chars.forEach((ch, k) => {
    const a = -Math.PI / 2 + k * step;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
  });
  ctx.restore();
}
const travelgrid: Template = {
  id: "travelgrid",
  name: "Day Recap Grid",
  blurb: "Nine photo tiles in a grid over your full photo, a script title and a round date badge.",
  overlayLabel: "Photo tint",
  capacity: 4,
  decorations: decos([["labels", "Corner labels", true], ["badge", "Date badge", true]]),
  slotRects: () => [{ x: 0, y: 0, w: W, h: H }, tgTile(1), tgTile(2), tgTile(3)],
  defaults: (i) => ({
    headline: t({ text: i.headline, font: "hand", size: 74, color: WHITE, x: 108 / W, y: 462 / H, width: 0.42 }),
    caption: t({ text: i.caption || "", font: "sans", size: 20, color: WHITE, x: 0.5, y: 1428 / H, width: 0.84, align: "center" }),
    overlay: { strength: 0, color: "#000000" },
    decorations: { labels: true, badge: true },
  }),
  draw(ctx, _p, s, slots) {
    drawPhoto(ctx, slots.photo(0), { x: 0, y: 0, w: W, h: H }, slots.crop(0));
    ctx.fillStyle = rgba(s.overlay.color, s.overlay.strength);
    ctx.fillRect(0, 0, W, H);
    for (let k = 0; k < 9; k++) slotPhoto(ctx, slots, (k + 1) % 4, tgTile(k), 0, undefined, `tile${k}`);
    if (on(s, "labels")) {
      uiText(ctx, "Creative\nStory", 204, 291, 19, WHITE, 600, "left", 1.15);
      uiText(ctx, "Shot on iPhone", 560, 312, 19, WHITE, 600, "center");
      uiText(ctx, "Me Time\nslow days", 910, 296, 19, WHITE, 600, "right", 1.15);
      uiText(ctx, "Made by", 560, 1822, 15, "rgba(255,255,255,0.85)", 400, "center");
    }
    if (on(s, "badge")) {
      const { dd, month } = stampParts(s);
      circleText(ctx, `${month} - ${month} - ${month} - `, 880, 509, 66, 22);
      uiText(ctx, String(Number(dd)), 880, 482, 52, WHITE, 700, "center");
    }
  },
  text: { headline: { shadow: false, tracking: 0 }, caption: { tracking: 0 } },
};

// ---- pin 4996249583549325: an editorial note over your photo — red year, big lowercase
// title, a small paragraph, your song quoted with a red underline, colour swatches, and a
// frosted card with the date, three thumbnails and a time rule.
const TS_CARD: Rect = { x: 107, y: 1413, w: 872, h: 249 };
const TS_THUMBS: Rect[] = [226, 502, 775].map((x) => ({ x, y: 1441, w: 240, h: 139 }));
const turningsoul: Template = {
  id: "turningsoul",
  name: "Turning Soul",
  blurb: "Editorial note over your photo: red year, big lowercase title, your song quoted, a frosted photo card.",
  overlayLabel: "Card frost",
  capacity: 4,
  decorations: decos([["card", "Photo card", true], ["swatches", "Colour swatches", true], ["song", "Song quote", true]]),
  slotRects: () => [{ x: 0, y: 0, w: W, h: H }, ...TS_THUMBS],
  defaults: (i) => ({
    headline: t({ text: i.headline.toLowerCase(), font: "serif", family: "Arimo", size: 70, color: "#111111", x: 480 / W, y: 0.362, width: 0.3 }),
    caption: t({ text: i.caption || "the sea was quiet today, and so was i.\n\nsome days are only for breathing.", font: "serif", family: "Arimo", size: 19, color: "#222222", x: 205 / W, y: 797 / H, width: 210 / W }),
    overlay: { strength: 0.55, color: "#ffffff" },
    decorations: { card: true, swatches: true, song: true },
  }),
  draw(ctx, _p, s, slots) {
    drawPhoto(ctx, slots.photo(0), { x: 0, y: 0, w: W, h: H }, slots.crop(0));
    const { yy, mm, dd } = stampParts(s);
    uiText(ctx, `2K${yy}`, 362, 566, 30, "#d0302c", 400);
    ctx.save();
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(405, 693, 15, 0, Math.PI * 2);
    ctx.moveTo(397, 693);
    ctx.lineTo(413, 693);
    ctx.moveTo(407, 686);
    ctx.lineTo(413, 693);
    ctx.lineTo(407, 700);
    ctx.stroke();
    ctx.restore();
    if (on(s, "song") && s.cover?.title) {
      uiText(ctx, s.cover.title, 660, 600, 19, "#222", 400, "left", 1.2);
      if (s.cover.artist) {
        uiText(ctx, `-  ${s.cover.artist}`, 666, 690, 19, "#222", 400);
        ctx.fillStyle = "#d0302c";
        ctx.fillRect(684, 714, Math.min(140, 12 * s.cover.artist.length), 2);
      }
    }
    uiText(ctx, `${dd}\n${mm}`, 782, 894, 26, "#d0302c", 400, "left", 1.1);
    if (on(s, "swatches")) {
      const pal = [...s.palette, "#8a8f8f", "#b9c8c6", "#3e4442"];
      [[751, 920, 0], [751, 963, 1], [797, 963, 2]].forEach(([x, y, k]) => {
        ctx.fillStyle = pal[k as number]!;
        ctx.fillRect(x as number, y as number, 30, 30);
      });
    }
    if (on(s, "card")) {
      ctx.fillStyle = rgba(s.overlay.color, s.overlay.strength);
      roundRect(ctx, TS_CARD, 32);
      ctx.fill();
      uiText(ctx, `${dd}\n${mm}`, 155, 1478, 31, "#111", 400, "left", 1.05);
      TS_THUMBS.forEach((r, k) => slotPhoto(ctx, slots, k + 1, r, 18));
      uiText(ctx, "16 : 14", 140, 1612, 16, "#222", 400);
      ctx.fillStyle = "#333";
      ctx.fillRect(217, 1621, W - 217, 1.5);
    }
    uiText(ctx, "archive by you\nshot on a slow day", 136, 1700, 18, WHITE, 400, "left", 1.25);
    uiText(ctx, "CREATIVE\nSTORY", 811, 1700, 18, WHITE, 400, "left", 1.05);
  },
  text: { headline: { tracking: -0.02, lineHeight: 1.19 }, caption: { tracking: 0, lineHeight: 1.18 } },
};

// ---- pin 38984353019569576: a half-circle portrait in black and white beside three tiles cut
// by a larger circle; bold uppercase title and paragraph on warm grey.
const CC_C1 = { x: 587, y: 581, r: 472 };
const CC_C2 = { x: 622, y: 826, r: 719 };
const CC_BANDS: Rect[] = [107, 597, 1086].map((y, k) => ({ x: 622, y, w: W - 622, h: k === 2 ? 455 : 458 }));
function clipped(ctx: Ctx, clip: () => void, draw: () => void) {
  ctx.save();
  ctx.beginPath();
  clip();
  ctx.clip();
  draw();
  ctx.restore();
}
const circlecollage: Template = {
  id: "circlecollage",
  name: "Circle Collage",
  blurb: "A half-circle portrait in black and white beside three circle-cut tiles, bold uppercase type.",
  overlayLabel: "Paper",
  capacity: 4,
  decorations: [],
  slotRects: () => [{ x: 115, y: 109, w: 473, h: 944 }, ...CC_BANDS],
  defaults: (i) => ({
    headline: t({ text: i.headline.toUpperCase(), font: "sans", size: 59, color: "#2b2b2b", x: 107 / W, y: 1180 / H, width: 0.33 }),
    caption: t({ text: (i.caption || "the only way forward is to let go of the past and hold on to today.").toUpperCase(), font: "sans", size: 22, color: "#2b2b2b", x: 107 / W, y: 1497 / H, width: 0.317 }),
    overlay: { strength: 1, color: "#e6e5e2" },
    decorations: {},
  }),
  draw(ctx, _p, s, slots) {
    ctx.fillStyle = s.overlay.color;
    ctx.fillRect(0, 0, W, H);
    const bw = (p: Photo) => filteredPhoto(p, "bw");
    clipped(ctx, () => {
      ctx.arc(CC_C1.x, CC_C1.y, CC_C1.r, 0, Math.PI * 2);
    }, () => {
      ctx.beginPath();
      ctx.rect(0, 0, 588, H);
      ctx.clip();
      slotPhoto(ctx, slots, 0, { x: 115, y: 109, w: 473, h: 944 }, 0, bw);
    });
    CC_BANDS.forEach((r, k) =>
      clipped(ctx, () => ctx.arc(CC_C2.x, CC_C2.y, CC_C2.r, 0, Math.PI * 2), () => slotPhoto(ctx, slots, k + 1, r, 0, k === 2 ? bw : undefined)),
    );
    const { yy, mm, dd } = stampParts(s);
    uiText(ctx, `'${yy}`, 107, 124, 26, "#2b2b2b", 700);
    uiText(ctx, `${dd}.${mm}.20${yy}`, 107, 1790, 22, "#2b2b2b", 700);
  },
  text: { headline: { tracking: -0.02, lineHeight: 0.95 }, caption: { tracking: 0, lineHeight: 1.15 } },
};

// ---- pin 368661919519569281: four overlapping bordered photos over your photo washed in pale
// yellow, a bold block of type with big and small lines.
const LV_TILES: Rect[] = [
  { x: 34, y: 530, w: 553, h: 743 },
  { x: 468, y: 173, w: 515, h: 518 },
  { x: 599, y: 699, w: 436, h: 586 },
  { x: 112, y: 1280, w: 478, h: 485 },
];
const LV_ORDER = [1, 0, 2, 3]; // the big left photo sits over the top-right one
const lovelooks: Template = {
  id: "lovelooks",
  name: "Love Looks",
  blurb: "Four overlapping bordered photos on a pale wash of yours, a bold block of big and small lines.",
  overlayLabel: "Wash",
  capacity: 4,
  decorations: [],
  slotRects: () => LV_TILES,
  defaults: (i) => ({
    headline: t({ text: "LOVE\nLOOKS PRETTY\nON YOU,\nLOOK\nPRETTY ON ME", font: "sans", size: 58, color: "#111111", x: 613 / W, y: 1312 / H, width: 0.4 }),
    caption: t({ text: i.caption || "", font: "sans", size: 26, color: "#111111", x: 613 / W, y: 1262 / H, width: 0.38 }),
    overlay: { strength: 0.62, color: "#eceeaa" },
    decorations: {},
  }),
  draw(ctx, _p, s, slots) {
    drawPhoto(ctx, slots.photo(0), { x: 0, y: 0, w: W, h: H }, slots.crop(0));
    ctx.fillStyle = rgba(s.overlay.color, s.overlay.strength);
    ctx.fillRect(0, 0, W, H);
    for (const k of LV_ORDER) {
      const r = LV_TILES[k]!;
      ctx.fillStyle = "#f4f2cf";
      ctx.fillRect(r.x - 5, r.y - 5, r.w + 10, r.h + 10);
      slotPhoto(ctx, slots, k, r);
    }
  },
  text: { headline: { tracking: 0, lineHeight: 1.06, lineScale: [1, 0.64, 1.17, 1, 0.64] }, caption: { tracking: 0 } },
};

// ---- pin 1105915252266068730: a 2×2 day grid — the last tile blurred under the phone's Focus
// menu (Do Not Disturb, Sleep, your own focus "on").
const FM_Q: Rect[] = [
  { x: 0, y: 0, w: 540, h: 960 },
  { x: 540, y: 0, w: 540, h: 960 },
  { x: 0, y: 960, w: 540, h: 960 },
  { x: 540, y: 960, w: 540, h: 960 },
];
function pill(ctx: Ctx, y: number, fill: string, label: string, sub: string | null, ink: string, icon: (cx: number, cy: number) => void) {
  const r: Rect = { x: 602, y, w: 416, h: 100 };
  ctx.fillStyle = fill;
  roundRect(ctx, r, 50);
  ctx.fill();
  icon(651, y + 50);
  ctx.save();
  ui(ctx, 500, 21);
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 809, sub ? y + 40 : y + 50);
  if (sub) {
    ui(ctx, 400, 15);
    ctx.fillStyle = "#8e8e93";
    ctx.fillText(sub, 809, y + 64);
  }
  ui(ctx, 700, 22);
  ctx.fillStyle = sub ? "#b0b0b5" : ink;
  ctx.fillText("•••", 968, y + 50);
  ctx.restore();
}
const focusmode: Template = {
  id: "focusmode",
  name: "Focus Mode",
  blurb: "A 2×2 day grid; the last tile blurred under the phone's Focus menu with your own focus on.",
  overlayLabel: "Blur tint",
  capacity: 4,
  decorations: decos([["menu", "Focus menu", true]]),
  slotRects: () => FM_Q,
  defaults: (i) => ({
    headline: t({ text: i.headline || `${WEEKDAYS[i.date.getDay()]} vibes`, font: "serif", size: 30, color: WHITE, x: 308 / W, y: 0.388, width: 0.22 }),
    caption: t({ text: i.caption || "", font: "serif", size: 21, color: WHITE, x: 600 / W, y: 415 / H, width: 0.4 }),
    overlay: { strength: 0.12, color: "#000000" },
    decorations: { menu: true },
  }),
  draw(ctx, _p, s, slots) {
    for (let k = 0; k < 3; k++) slotPhoto(ctx, slots, k, FM_Q[k]!);
    const q = FM_Q[3]!;
    ctx.save();
    ctx.beginPath();
    ctx.rect(q.x, q.y, q.w, q.h);
    ctx.clip();
    const own = slots.own(3);
    drawBlurred(ctx, slots.photo(own ? 3 : 0), q, own ? slots.crop(3) : slots.adjust("slot3", slots.crop(0)));
    ctx.fillStyle = rgba(s.overlay.color, s.overlay.strength);
    ctx.fillRect(q.x, q.y, q.w, q.h);
    ctx.restore();
    if (!on(s, "menu")) return;
    const moon = (cx: number, cy: number) => {
      ctx.fillStyle = WHITE;
      ctx.beginPath();
      ctx.arc(cx, cy, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(58,58,62,1)";
      ctx.beginPath();
      ctx.arc(cx + 7, cy - 5, 11, 0, Math.PI * 2);
      ctx.fill();
    };
    const bed = (cx: number, cy: number) => {
      ctx.fillStyle = WHITE;
      roundRect(ctx, { x: cx - 16, y: cy - 2, w: 32, h: 10 }, 2);
      ctx.fill();
      ctx.fillRect(cx - 16, cy - 12, 4, 26);
      roundRect(ctx, { x: cx - 10, y: cy - 10, w: 9, h: 7 }, 3);
      ctx.fill();
    };
    const leaf = (cx: number, cy: number) => {
      ctx.fillStyle = "#34c759";
      ctx.beginPath();
      ctx.ellipse(cx, cy, 15, 8, -Math.PI / 4, 0, Math.PI * 2);
      ctx.fill();
    };
    pill(ctx, 1271, "rgba(58,58,62,0.82)", "Do Not Disturb", null, WHITE, moon);
    pill(ctx, 1390, "rgba(58,58,62,0.82)", "Sleep", null, WHITE, bed);
    pill(ctx, 1508, "rgba(255,255,255,0.93)", "Me", "On", "#111111", leaf);
    ctx.fillStyle = "rgba(40,40,42,0.85)";
    ctx.beginPath();
    ctx.arc(808, 1900, 33, 0, Math.PI * 2);
    ctx.fill();
    uiText(ctx, "+", 808, 1878, 36, WHITE, 300, "center");
  },
  text: { headline: { shadow: true, tracking: 0 }, caption: { shadow: true, tracking: 0 } },
};

export const PIN2_TEMPLATES: Record<string, Template> = Object.fromEntries(
  [lyriclily, keyphoto, sidecollage, travelgrid, turningsoul, circlecollage, lovelooks, focusmode].map((tpl) => [tpl.id, tpl]),
);
