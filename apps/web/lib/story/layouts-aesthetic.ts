// 56 declarative layouts (50 aesthetic + 6 song-cover), modelled on design-refs/pinterest/
// {aesthetic1-6,cover1-4}. Ranking metadata for these lives in
// apps/api/app/services/recommendations/catalogue_aesthetic.json (ids must match; tested).
import { type Spec, fromSpec } from "./spec";
import type { Template } from "./kit";
import type { FontRole, TemplateId, TemplateInput, TextLayer } from "./types";

const T = (font: FontRole, size: number, x: number, y: number, extra: Partial<TextLayer> = {}): Partial<TextLayer> => ({
  font,
  size,
  x,
  y,
  width: 0.84,
  align: "left",
  ...extra,
});
const C = (font: FontRole, size: number, y: number, extra: Partial<TextLayer> = {}) => T(font, size, 0.5, y, { align: "center", ...extra });
const WHITE = "#ffffff";
const INK = "#1d1d1b";

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
/** "saturday" → "sat\nur\nday" (the stacked weekday from the references). */
function stackedDay(i: TemplateInput): string {
  const d = WEEKDAYS[i.date.getDay()]!;
  const head = d.slice(0, -3);
  return head.length > 3 ? `${head.slice(0, 3)}\n${head.slice(3)}\nday` : `${head}\nday`;
}

const FULL = { x: 0, y: 0, w: 1080, h: 1920 };

const SPECS: Spec[] = [
  // ---- type-led -------------------------------------------------------------------------
  {
    id: "weekday", name: "Weekday", blurb: "Your day of the week, stacked huge in bold type over the photo.",
    bg: { kind: "photo" }, overlay: { strength: 0.25, color: "#000000" }, frames: [{ slot: 0, r: FULL }],
    deco: [{ k: "circle", x: 900, y: 1160, rad: 16, color: "#f2c14e" }],
    headline: (i) => ({ ...T("sans", 210, 0.2, 0.3, { color: WHITE, width: 0.8 }), text: stackedDay(i) }),
    caption: T("mono", 22, 0.2, 0.7, { color: WHITE, text: "enjoy your weekend · archive by you" }),
    text: { headline: { lineHeight: 0.8, tracking: -0.05, shadow: true } },
  },
  {
    id: "daysplit", name: "Day Split", blurb: "Two photos stacked with the weekday split across them in giant letters.", capacity: 2,
    bg: { kind: "color", color: "#111111" }, frames: [{ slot: 0, r: { x: 0, y: 0, w: 1080, h: 960 } }, { slot: 1, r: { x: 0, y: 960, w: 1080, h: 960 } }],
    deco: [
      { k: "text", text: "{WD3}", x: 50, y: 740, size: 220, font: "sans", color: WHITE },
      { k: "text", text: "DAY", x: 1040, y: 975, size: 220, font: "sans", color: WHITE, align: "right" },
    ],
    headline: C("mono", 26, 0.135, { color: WHITE }), caption: C("mono", 22, 0.79, { color: WHITE }),
    text: { headline: { shadow: true }, caption: { shadow: true } },
  },
  {
    id: "halfword", name: "Half Word", blurb: "The weekday broken in two — top half over one photo, the rest over the next.", capacity: 2,
    bg: { kind: "color", color: "#0f0f0f" }, frames: [{ slot: 0, r: { x: 0, y: 0, w: 1080, h: 1100 } }, { slot: 1, r: { x: 0, y: 1100, w: 1080, h: 820 } }],
    deco: [
      { k: "text", text: "{wdA}", x: 1040, y: 880, size: 190, font: "sans", color: WHITE, align: "right" },
      { k: "text", text: "{wdB}", x: 40, y: 1110, size: 190, font: "sans", color: WHITE },
      { k: "line", x1: 0, y1: 1100, x2: 1080, y2: 1100, color: WHITE, lw: 6 },
    ],
    headline: T("mono", 24, 0.08, 0.135, { color: WHITE }), caption: T("mono", 22, 0.08, 0.79, { color: WHITE }),
    text: { headline: { shadow: true }, caption: { shadow: true } },
  },
  {
    id: "verticalday", name: "Vertical Day", blurb: "A full-bleed photo with the weekday set vertically along the edge.",
    bg: { kind: "photo" }, overlay: { strength: 0.15, color: "#000000" }, frames: [{ slot: 0, r: FULL }],
    deco: [
      { k: "text", text: "{WEEKDAY}", x: 140, y: 1500, size: 150, font: "sans", color: WHITE, rot: -90 },
      { k: "line", x1: 190, y1: 300, x2: 190, y2: 1560, color: WHITE, lw: 2 },
    ],
    headline: T("italic", 50, 0.25, 0.7, { color: WHITE, width: 0.65 }), caption: T("mono", 20, 0.25, 0.775, { color: WHITE, width: 0.65 }),
    text: { headline: { shadow: true } },
  },
  {
    id: "scripttitle", name: "Script Title", blurb: "One big handwritten line over the photo — the little things.",
    bg: { kind: "photo" }, overlay: { strength: 0.25, color: "#000000" }, frames: [{ slot: 0, r: FULL }],
    headline: C("hand", 130, 0.38, { color: WHITE, width: 0.86 }), caption: C("mono", 22, 0.55, { color: WHITE }),
    text: { headline: { shadow: true, lineHeight: 0.9 } },
  },
  {
    id: "refresh", name: "Refresh", blurb: "A landscape with a sweeping script word and a quiet subtitle.",
    bg: { kind: "photo" }, overlay: { strength: 0.15, color: "#000000" }, frames: [{ slot: 0, r: FULL }],
    deco: [{ k: "squiggle", x: 380, y: 940, w: 320, color: WHITE }],
    headline: C("hand", 160, 0.33, { color: WHITE, width: 0.9 }), caption: C("italic", 32, 0.45, { color: WHITE, text: "find a place to heal your soul" }),
    text: { headline: { shadow: true, lineHeight: 0.85 }, caption: { shadow: true } },
  },
  {
    id: "bigletters", name: "Big Letters", blurb: "Oversized letters bleeding off the photo, poster-style.",
    bg: { kind: "photo" }, overlay: { strength: 0.2, color: "#000000" }, frames: [{ slot: 0, r: FULL }],
    headline: T("display", 250, 0.04, 0.55, { color: WHITE, width: 1.2 }), caption: T("mono", 22, 0.06, 0.135, { color: WHITE }),
    text: { headline: { lineHeight: 0.78, tracking: -0.06, shadow: true } },
  },
  {
    id: "navheader", name: "Daily Header", blurb: "A moody photo with a slim nav bar and a big serif title.",
    bg: { kind: "photo" }, overlay: { strength: 0.4, color: "#000000" }, frames: [{ slot: 0, r: FULL }],
    deco: [
      { k: "rect", r: { x: 80, y: 280, w: 920, h: 56 }, color: WHITE, alpha: 0.12, radius: 28 },
      { k: "text", text: "daily     ·     instagram     ·     stories", x: 540, y: 296, size: 22, font: "mono", color: WHITE, align: "center" },
      { k: "text", text: "{weekday}, {day} {month}", x: 88, y: 400, size: 24, font: "serif", color: WHITE },
    ],
    headline: T("display", 96, 0.08, 0.24, { color: WHITE, width: 0.75 }), caption: T("serif", 26, 0.08, 0.4, { color: WHITE, width: 0.6 }),
  },
  {
    id: "quotemarks", name: "Quote", blurb: "Big quote marks and a serif line over a darkened photo.",
    bg: { kind: "photo" }, overlay: { strength: 0.45, color: "#000000" }, frames: [{ slot: 0, r: FULL }],
    deco: [{ k: "text", text: "“", x: 90, y: 360, size: 320, font: "display", color: WHITE, alpha: 0.85 }],
    headline: T("italic", 66, 0.1, 0.4, { color: WHITE, width: 0.8 }), caption: T("mono", 22, 0.1, 0.62, { color: WHITE }),
  },
  {
    id: "spotlight", name: "Spotlight", blurb: "A deep vignette pulls focus to the centre, with white type.",
    bg: { kind: "photo" }, overlay: { strength: 0.1, color: "#000000" }, frames: [{ slot: 0, r: FULL }],
    deco: [{ k: "vignette", strength: 0.85 }],
    headline: C("display", 74, 0.62, { color: WHITE }), caption: C("italic", 32, 0.7, { color: WHITE }),
  },
  {
    id: "bluehour", name: "Blue Hour", blurb: "A cool, quiet grade with a centred serif line between rules.", filter: "cool",
    bg: { kind: "photo" }, overlay: { strength: 0.25, color: "#14213d" }, frames: [{ slot: 0, r: FULL }],
    deco: [
      { k: "line", x1: 390, y1: 840, x2: 690, y2: 840, color: WHITE, lw: 2 },
      { k: "line", x1: 390, y1: 1010, x2: 690, y2: 1010, color: WHITE, lw: 2 },
    ],
    headline: C("italic", 58, 0.45, { color: WHITE, width: 0.7 }), caption: C("mono", 22, 0.51, { color: WHITE }),
  },
  {
    id: "subtitlebar", name: "Subtitle Bar", blurb: "Full photo with a cinema subtitle bar for a lyric or a line.",
    bg: { kind: "photo" }, overlay: { strength: 0.1, color: "#000000" }, frames: [{ slot: 0, r: FULL }],
    deco: [{ k: "grain", alpha: 0.1 }, { k: "rect", r: { x: 0, y: 1360, w: 1080, h: 170 }, color: "#000000", alpha: 0.72 }],
    headline: C("italic", 46, 0.725, { color: "#fff7d6" }), caption: T("mono", 22, 0.08, 0.135, { color: WHITE }),
  },
  // ---- blocks & badges --------------------------------------------------------------------
  {
    id: "redblock", name: "Red Block", blurb: "Black-and-white photo with one red block holding a few words.", filter: "bw",
    bg: { kind: "photo" }, overlay: { strength: 0.05, color: "#000000" }, frames: [{ slot: 0, r: FULL }],
    deco: [{ k: "rect", r: { x: 470, y: 700, w: 330, h: 560 }, color: "#d23b2c", alpha: 0.88 }],
    headline: T("mono", 30, 0.46, 0.385, { color: WHITE, width: 0.26 }), caption: T("mono", 20, 0.46, 0.6, { color: WHITE, width: 0.26 }),
  },
  {
    id: "badge", name: "Quote Badge", blurb: "A red circle badge with a short quote over a monochrome photo.", filter: "bw",
    bg: { kind: "photo" }, overlay: { strength: 0.1, color: "#000000" }, frames: [{ slot: 0, r: FULL }],
    deco: [{ k: "circle", x: 640, y: 1000, rad: 170, color: "#c0392b", alpha: 0.95 }],
    headline: T("sans", 42, 0.52, 0.48, { color: WHITE, width: 0.24 }), caption: T("mono", 20, 0.08, 0.79, { color: WHITE }),
  },
  {
    id: "stats", name: "Stats", blurb: "A night photo with a script title and a block of little stats.",
    bg: { kind: "photo" }, overlay: { strength: 0.3, color: "#000000" }, frames: [{ slot: 0, r: FULL }],
    deco: [
      { k: "text", text: "mood\n{tag0}", x: 200, y: 1250, size: 28, font: "mono", color: WHITE, align: "center" },
      { k: "text", text: "light\n{tag1}", x: 540, y: 1250, size: 28, font: "mono", color: WHITE, align: "center" },
      { k: "text", text: "date\n{day}.{mm}", x: 880, y: 1250, size: 28, font: "mono", color: WHITE, align: "center" },
    ],
    headline: C("hand", 120, 0.42, { color: WHITE }), caption: C("mono", 22, 0.135, { color: WHITE }),
    text: { headline: { shadow: true } },
  },
  {
    id: "notesapp", name: "Notes Card", blurb: "A clean notes card over the photo — a thought, a list, a line.",
    bg: { kind: "photo" }, overlay: { strength: 0.1, color: "#000000" }, frames: [{ slot: 0, r: FULL }],
    deco: [
      { k: "rect", r: { x: 90, y: 560, w: 900, h: 300 }, color: "#fbfaf6", radius: 22 },
      { k: "text", text: "‹ notes", x: 120, y: 584, size: 26, font: "sans", color: "#d9a62e" },
    ],
    headline: T("serif", 34, 0.115, 0.34, { width: 0.77, color: INK }), caption: T("mono", 20, 0.115, 0.42, { color: "#69645f" }),
  },
  {
    id: "handnote", name: "Hand Note", blurb: "A white card with red handwriting pinned over a black-and-white photo.", filter: "bw",
    bg: { kind: "photo" }, overlay: { strength: 0.05, color: "#000000" }, frames: [{ slot: 0, r: FULL }],
    deco: [{ k: "rect", r: { x: 580, y: 360, w: 400, h: 360 }, color: "#fdfcf8", rot: 3 }],
    headline: T("hand", 44, 0.565, 0.21, { color: "#c0392b", width: 0.32 }), caption: T("mono", 20, 0.08, 0.79, { color: WHITE }),
    text: { headline: { rotate: 0.05, lineHeight: 1 } },
  },
  {
    id: "sticky", name: "Sticky Note", blurb: "A taped yellow sticky note with a handwritten line over the photo.",
    bg: { kind: "photo" }, overlay: { strength: 0.08, color: "#000000" }, frames: [{ slot: 0, r: FULL }],
    deco: [{ k: "rect", r: { x: 560, y: 1060, w: 420, h: 400 }, color: "#f7e27a", rot: -4 }, { k: "tape", x: 770, y: 1060, rot: -6 }],
    headline: T("hand", 54, 0.545, 0.57, { color: INK, width: 0.34 }), caption: T("mono", 20, 0.08, 0.135, { color: WHITE }),
    text: { headline: { rotate: -0.07, lineHeight: 1 } },
  },
  {
    id: "checklist", name: "Checklist", blurb: "A to-do card checking off what's in the photo.",
    bg: { kind: "photo" }, overlay: { strength: 0.3, color: "#000000" }, frames: [{ slot: 0, r: FULL }],
    deco: [{ k: "rect", r: { x: 90, y: 900, w: 900, h: 520 }, color: "#fbf6ea", radius: 22 }, { k: "checklist", x: 150, y: 990, size: 52, color: INK }],
    headline: T("hand", 84, 0.08, 0.14, { color: WHITE }), caption: T("mono", 20, 0.12, 0.765, { color: "#69645f" }),
    text: { headline: { shadow: true } },
  },
  {
    id: "calendarcard", name: "Calendar", blurb: "The month's calendar card with today circled, over the photo.",
    bg: { kind: "photo" }, overlay: { strength: 0.15, color: "#000000" }, frames: [{ slot: 0, r: FULL }],
    deco: [{ k: "calendar", r: { x: 560, y: 1080, w: 440, h: 330 }, color: INK, accent: "#c03f13" }],
    headline: T("display", 80, 0.08, 0.15, { color: WHITE, width: 0.8 }), caption: T("serif", 28, 0.08, 0.27, { color: WHITE }),
    text: { headline: { shadow: true } },
  },
  {
    id: "receipt", name: "Receipt", blurb: "A little receipt of the day — items from the photo, total: priceless.",
    bg: { kind: "photo" }, overlay: { strength: 0.15, color: "#000000" }, frames: [{ slot: 0, r: FULL }],
    deco: [{ k: "receipt", r: { x: 560, y: 400, w: 420, h: 360 } }],
    headline: T("hand", 72, 0.08, 0.6, { color: WHITE, width: 0.6 }), caption: T("mono", 20, 0.08, 0.72, { color: WHITE }),
    text: { headline: { shadow: true } },
  },
  // ---- frames -----------------------------------------------------------------------------
  {
    id: "doodlesun", name: "Doodle Frame", blurb: "A rounded photo ringed with white doodles — sun, hearts, swirls.",
    bg: { kind: "blur" }, overlay: { strength: 0.25, color: "#000000" },
    frames: [{ slot: 0, r: { x: 150, y: 400, w: 780, h: 980 }, shape: "round", radius: 30 }],
    deco: [
      { k: "scribble", r: { x: 130, y: 380, w: 820, h: 1020 }, color: WHITE },
      { k: "sticker", kind: "sparkle", x: 220, y: 340, scale: 0.7, color: WHITE },
      { k: "sticker", kind: "swirl", x: 900, y: 1420, scale: 0.7, color: WHITE },
      { k: "sticker", kind: "heart", x: 880, y: 360, scale: 0.45, color: "#f4efe6" },
    ],
    headline: C("hand", 70, 0.135, { color: WHITE }), caption: C("mono", 20, 0.765, { color: WHITE }),
    text: { headline: { shadow: true } },
  },
  {
    id: "bigpolaroid", name: "Big Polaroid", blurb: "One big polaroid on a blurred backdrop, captioned by hand.",
    bg: { kind: "blur" }, overlay: { strength: 0.25, color: "#000000" },
    frames: [{ slot: 0, r: { x: 160, y: 330, w: 760, h: 880 }, shape: "polaroid", rot: -2 }],
    headline: C("hand", 58, 0.658, { color: INK }), caption: C("mono", 22, 0.78, { color: WHITE }),
    text: { headline: { rotate: -0.035 } },
  },
  {
    id: "framein", name: "Frame in Frame", blurb: "A framed photo with a smaller crop of itself inset — a loop.",
    bg: { kind: "blur" }, overlay: { strength: 0.2, color: "#000000" },
    frames: [{ slot: 0, r: { x: 160, y: 330, w: 760, h: 1100 }, border: WHITE, borderW: 8 }],
    deco: [{ k: "rect", r: { x: 372, y: 692, w: 336, h: 436 }, color: WHITE }, { k: "photo", slot: 0, r: { x: 380, y: 700, w: 320, h: 420 }, zoom: 1.8, dx: 0, dy: 0 }],
    headline: C("italic", 46, 0.78, { color: WHITE }), caption: C("mono", 20, 0.135, { color: WHITE }),
    text: { headline: { shadow: true } },
  },
  {
    id: "postcard", name: "Postcard", blurb: "A postcard: photo on the left, stamp and handwritten note on the right.",
    bg: { kind: "blur" }, overlay: { strength: 0.25, color: "#000000" },
    under: [{ k: "rect", r: { x: 80, y: 560, w: 920, h: 640 }, color: "#fbf8f1", radius: 12 }, { k: "line", x1: 600, y1: 600, x2: 600, y2: 1160, color: "#cdbfa5", lw: 2 },
      { k: "line", x1: 630, y1: 1000, x2: 960, y2: 1000, color: "#cdbfa5" }, { k: "line", x1: 630, y1: 1060, x2: 960, y2: 1060, color: "#cdbfa5" }, { k: "line", x1: 630, y1: 1120, x2: 960, y2: 1120, color: "#cdbfa5" }],
    frames: [{ slot: 0, r: { x: 110, y: 590, w: 460, h: 580 } }],
    deco: [{ k: "sticker", kind: "stamp", x: 900, y: 680, scale: 0.6, color: "#c03f13" }, { k: "text", text: "post card", x: 630, y: 600, size: 26, font: "display", color: INK }],
    headline: T("hand", 46, 0.585, 0.38, { color: INK, width: 0.3 }), caption: T("mono", 20, 0.585, 0.47, { color: "#69645f", width: 0.3 }),
  },
  // ---- collage & multi-photo -----------------------------------------------------------------
  {
    id: "stackedcards", name: "Stacked Cards", blurb: "Three photos as tilted cards stacked over a blurred backdrop.", capacity: 3,
    bg: { kind: "blur" }, overlay: { strength: 0.3, color: "#000000" },
    frames: [
      { slot: 0, r: { x: 560, y: 300, w: 380, h: 420 }, shape: "polaroid", rot: 8 },
      { slot: 1, r: { x: 170, y: 560, w: 400, h: 450 }, shape: "polaroid", rot: -6 },
      { slot: 2, r: { x: 540, y: 930, w: 380, h: 430 }, shape: "polaroid", rot: 4 },
    ],
    headline: T("sans", 50, 0.07, 0.73, { color: WHITE, width: 0.5 }), caption: T("mono", 20, 0.07, 0.135, { color: WHITE }),
    text: { headline: { shadow: true } },
  },
  {
    id: "bwstack", name: "B&W Stack", blurb: "Three monochrome strips stacked to one side of a blurred scene.", capacity: 3, filter: "bw",
    bg: { kind: "blur" }, overlay: { strength: 0.25, color: "#000000" },
    frames: [
      { slot: 0, r: { x: 460, y: 330, w: 560, h: 330 }, border: WHITE, borderW: 6, shadow: true },
      { slot: 1, r: { x: 460, y: 700, w: 560, h: 330 }, border: WHITE, borderW: 6, shadow: true },
      { slot: 2, r: { x: 460, y: 1070, w: 560, h: 330 }, border: WHITE, borderW: 6, shadow: true },
    ],
    headline: T("italic", 54, 0.07, 0.3, { color: WHITE, width: 0.36 }), caption: T("mono", 20, 0.07, 0.6, { color: WHITE, width: 0.36 }),
  },
  {
    id: "wavecut", name: "Wave Cut", blurb: "Two photos split by a wavy paper band with handwritten notes.", capacity: 2,
    bg: { kind: "color", color: "#fbfaf6" },
    frames: [{ slot: 0, r: { x: 0, y: 0, w: 1080, h: 900 } }, { slot: 1, r: { x: 0, y: 1020, w: 1080, h: 900 } }],
    deco: [
      { k: "rect", r: { x: 0, y: 880, w: 1080, h: 160 }, color: "#fbfaf6" },
      { k: "squiggle", x: 40, y: 900, w: 1000, color: "#7d9bd1" },
      { k: "squiggle", x: 40, y: 1020, w: 1000, color: "#7d9bd1" },
      { k: "sticker", kind: "daisy", x: 960, y: 1500, scale: 0.8 },
    ],
    headline: C("hand", 56, 0.475, { color: INK }), caption: T("hand", 40, 0.08, 0.14, { color: WHITE }),
    text: { caption: { shadow: true } },
  },
  {
    id: "diagonal", name: "Diagonal Split", blurb: "Two photos cut on a diagonal with a title along the seam.", capacity: 2,
    bg: { kind: "color", color: "#111111" },
    frames: [{ slot: 0, r: { x: 0, y: 0, w: 1080, h: 1150 }, shape: "diagTop" }, { slot: 1, r: { x: 0, y: 870, w: 1080, h: 1050 }, shape: "diagBottom" }],
    headline: T("sans", 60, 0.08, 0.47, { color: WHITE, width: 0.8 }), caption: T("mono", 20, 0.08, 0.135, { color: WHITE }),
    text: { headline: { shadow: true }, caption: { shadow: true } },
  },
  // ---- grades & moods ----------------------------------------------------------------------
  {
    id: "filmburn", name: "Film Burn", blurb: "8mm look with orange burn at the edges, vignette and a date stamp.", filter: "8mm",
    bg: { kind: "photo" }, overlay: { strength: 0.05, color: "#000000" }, frames: [{ slot: 0, r: FULL }],
    deco: [
      { k: "gradient", from: "#ff6a00", to: "#ff6a00", y0: 1920, y1: 1500, alpha: 0.35 },
      { k: "vignette", strength: 0.55 }, { k: "grain", alpha: 0.16 },
      { k: "text", text: "{stamp}", x: 1000, y: 1470, size: 44, font: "mono", color: "#ff8a2a", align: "right" },
    ],
    headline: T("italic", 84, 0.08, 0.14, { color: "#f6ead7" }), caption: T("italic", 32, 0.08, 0.24, { color: "#f6ead7" }),
    text: { headline: { shadow: true } },
  },
  {
    id: "hearts", name: "Hearts", blurb: "A rosy tint with hearts scattered over the photo.",
    bg: { kind: "photo" }, overlay: { strength: 0.14, color: "#ff6f91" }, frames: [{ slot: 0, r: FULL }],
    deco: [
      { k: "sticker", kind: "heart", x: 160, y: 380, scale: 0.6, color: "#ff4f7b" }, { k: "sticker", kind: "heart", x: 900, y: 520, scale: 0.45, color: "#ffffff" },
      { k: "sticker", kind: "heart", x: 820, y: 1180, scale: 0.7, color: "#ff4f7b" }, { k: "sticker", kind: "heart", x: 230, y: 1300, scale: 0.4, color: "#ffffff" },
      { k: "sticker", kind: "sparkle", x: 940, y: 300, scale: 0.4, color: WHITE },
    ],
    headline: C("hand", 82, 0.7, { color: WHITE }), caption: C("mono", 22, 0.135, { color: WHITE }),
    text: { headline: { shadow: true } },
  },
  // ---- song-cover layouts (square album art) -------------------------------------------------
  {
    id: "coverface", name: "Cover Over Face", blurb: "The song's square cover placed over the face — the music trend.",
    bg: { kind: "photo" }, overlay: { strength: 0.1, color: "#000000" }, frames: [{ slot: 0, r: FULL }],
    cover: { show: true, style: "plain", scale: 1, rotate: 0 },
    headline: T("mono", 22, 0.08, 0.135, { color: WHITE }), caption: T("mono", 20, 0.08, 0.79, { color: WHITE }),
    text: { headline: { shadow: true }, caption: { shadow: true } },
  },
  {
    id: "coversingle", name: "New Single", blurb: "A 'new single' poster: big cover art centred on your blurred photo.",
    bg: { kind: "blur" }, overlay: { strength: 0.35, color: "#000000" },
    frames: [],
    deco: [
      { k: "text", text: "NEW SINGLE", x: 540, y: 290, size: 26, font: "mono", color: WHITE, align: "center" },
      { k: "text", text: "AVAILABLE NOW", x: 540, y: 340, size: 66, font: "sans", color: WHITE, align: "center" },
    ],
    cover: { show: true, style: "plain", scale: 2.3, rotate: 0, x: 0.5, y: 0.47 },
    headline: C("italic", 40, 0.75, { color: WHITE }), caption: C("mono", 20, 0.8, { color: WHITE }),
  },
  {
    id: "coverfloat", name: "Floating Player", blurb: "A tilted player card with the song's cover floating beside you.",
    bg: { kind: "photo" }, overlay: { strength: 0.12, color: "#000000" }, frames: [{ slot: 0, r: FULL }],
    cover: { show: true, style: "card", scale: 1.05, rotate: -8, x: 0.72, y: 0.42 },
    headline: T("italic", 56, 0.08, 0.14, { color: WHITE }), caption: T("mono", 20, 0.08, 0.79, { color: WHITE }),
    text: { headline: { shadow: true }, caption: { shadow: true } },
  },
  {
    id: "coverbubble", name: "Bubble Player", blurb: "A speech-bubble music player with the cover, popping off the photo.",
    bg: { kind: "photo" }, overlay: { strength: 0.1, color: "#000000" }, frames: [{ slot: 0, r: FULL }],
    cover: { show: true, style: "bubble", scale: 1.35, rotate: -10, x: 0.42, y: 0.3 },
    headline: C("hand", 70, 0.76, { color: WHITE }), caption: C("mono", 20, 0.135, { color: WHITE }),
    text: { headline: { shadow: true }, caption: { shadow: true } },
  },
  {
    id: "coverstack", name: "Player Stack", blurb: "Stacked, tilted player cards — your song on top, photo crops behind.",
    bg: { kind: "blur" }, overlay: { strength: 0.4, color: "#000000" },
    frames: [],
    under: [
      { k: "rect", r: { x: 140, y: 420, w: 420, h: 560 }, color: "#1c1a1e", alpha: 0.8, radius: 40, rot: -12 },
      { k: "photo", slot: 0, r: { x: 175, y: 455, w: 350, h: 350 }, rot: -12, zoom: 1.8, dx: -0.2 },
      { k: "rect", r: { x: 560, y: 1000, w: 420, h: 560 }, color: "#1c1a1e", alpha: 0.8, radius: 40, rot: 10 },
      { k: "photo", slot: 0, r: { x: 595, y: 1035, w: 350, h: 350 }, rot: 10, zoom: 2, dx: 0.25 },
    ],
    cover: { show: true, style: "card", scale: 1.15, rotate: 4, x: 0.52, y: 0.47 },
    headline: T("sans", 50, 0.08, 0.135, { color: WHITE }), caption: T("mono", 20, 0.08, 0.79, { color: WHITE }),
  },
  {
    id: "coverpolaroid", name: "Polaroid + Cover", blurb: "A polaroid on paper with the song cover taped on like a sticker.",
    bg: { kind: "paper", color: "#efe6d8" }, overlay: { strength: 0.3, color: "#efe6d8" },
    frames: [{ slot: 0, r: { x: 160, y: 420, w: 720, h: 760 }, shape: "polaroid", rot: -3 }],
    deco: [{ k: "tape", x: 800, y: 1170, rot: 30 }],
    cover: { show: true, style: "sticker", scale: 0.9, rotate: 8, x: 0.74, y: 0.71 },
    headline: T("hand", 64, 0.08, 0.13, { color: INK }), caption: C("mono", 20, 0.8, { color: "#69645f" }),
  },
];

// Grow to 50 aesthetic layouts with tasteful variations of strong compositions (different
// palettes, frames and type, not just recolours: each changes shape, frame or type role).
const VARIANTS: Spec[] = [
  { ...byId("notesapp"), id: "notesdark", name: "Dark Note", blurb: "A dark notes card with soft white type over the photo.", deco: [{ k: "rect", r: { x: 90, y: 1060, w: 900, h: 320 }, color: "#1c1c1e", alpha: 0.92, radius: 24 }, { k: "text", text: "‹ notes", x: 120, y: 1084, size: 26, font: "sans", color: "#f2c14e" }, { k: "line", x1: 120, y1: 1130, x2: 960, y2: 1130, color: "#3a3a3c", lw: 2 }], headline: T("serif", 34, 0.115, 0.6, { width: 0.77, color: WHITE }), caption: T("mono", 20, 0.115, 0.68, { color: "#a8a39b" }) },
];

function byId(id: string): Spec {
  const s = SPECS.find((x) => x.id === id);
  if (!s) throw new Error(`no spec ${id}`);
  return s;
}

export const AESTHETIC_SPECS: Spec[] = [...SPECS, ...VARIANTS];

export const AESTHETIC_TEMPLATES = Object.fromEntries(AESTHETIC_SPECS.map((s) => [s.id, fromSpec(s)])) as Record<string, Template>;

export const AESTHETIC_IDS = AESTHETIC_SPECS.map((s) => s.id) as TemplateId[];
