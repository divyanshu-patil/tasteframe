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
    id: "filmborder", name: "Film Border", blurb: "The photo in a wide white border with an orange date stamp.",
    bg: { kind: "color", color: "#fbfaf6" }, frames: [{ slot: 0, r: { x: 60, y: 250, w: 960, h: 1250 } }],
    deco: [{ k: "text", text: "{stamp}", x: 980, y: 1430, size: 40, font: "mono", color: "#ff8a2a", align: "right" }],
    headline: T("serif", 40, 0.06, 0.8, { width: 0.88, color: INK }), caption: T("mono", 20, 0.06, 0.135, { color: "#69645f" }),
  },
  {
    id: "archwindow", name: "Arch Window", blurb: "Your photo through an arched window on warm paper.",
    bg: { kind: "paper", color: "#ece4d8" }, overlay: { strength: 0.3, color: "#ece4d8" },
    frames: [{ slot: 0, r: { x: 210, y: 360, w: 660, h: 1000 }, shape: "arch", border: INK, borderW: 6 }],
    headline: C("italic", 62, 0.725, { color: INK }), caption: C("mono", 20, 0.135, { color: "#69645f" }),
  },
  {
    id: "circleframe", name: "Circle", blurb: "A bold circle crop on navy with a white serif title.",
    bg: { kind: "color", color: "#1f2a44" }, frames: [{ slot: 0, r: { x: 140, y: 400, w: 800, h: 800 }, shape: "circle", border: WHITE, borderW: 10 }],
    headline: C("display", 72, 0.665, { color: WHITE }), caption: C("mono", 22, 0.745, { color: "#c9d3e6" }),
  },
  {
    id: "blob", name: "Blob", blurb: "A soft organic blob crop on lavender with sparkles.",
    bg: { kind: "color", color: "#e3d9ff" }, frames: [{ slot: 0, r: { x: 110, y: 380, w: 860, h: 980 }, shape: "blob" }],
    deco: [{ k: "sticker", kind: "sparkle", x: 900, y: 380, scale: 0.9, color: WHITE }, { k: "sticker", kind: "sparkle", x: 170, y: 1350, scale: 0.6, color: WHITE }],
    headline: C("sans", 60, 0.745, { color: "#3a2a66" }), caption: C("mono", 20, 0.135, { color: "#3a2a66" }),
  },
  {
    id: "pastel", name: "Pastel Card", blurb: "A rounded photo on soft pink with a bow, hearts and sparkles.",
    bg: { kind: "color", color: "#f6d6e0" }, frames: [{ slot: 0, r: { x: 130, y: 360, w: 820, h: 960 }, shape: "round", radius: 60, border: WHITE, borderW: 16 }],
    deco: [{ k: "sticker", kind: "bow", x: 540, y: 360, scale: 1.1, color: "#e9a3b4" }, { k: "sticker", kind: "heart", x: 900, y: 1290, scale: 0.6, color: "#e85d8a" }, { k: "sticker", kind: "sparkle", x: 170, y: 420, scale: 0.6, color: WHITE }],
    headline: C("hand", 66, 0.715, { color: "#7a2e4a" }), caption: C("mono", 20, 0.785, { color: "#7a2e4a" }),
  },
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
    id: "scribbleframe", name: "Scribble Frame", blurb: "Peach paper, a rounded photo and inky hand-drawn outlines.",
    bg: { kind: "paper", color: "#f3d9c7" }, overlay: { strength: 0.3, color: "#f3d9c7" },
    frames: [{ slot: 0, r: { x: 140, y: 360, w: 800, h: 1040 }, shape: "round", radius: 26 }],
    deco: [
      { k: "scribble", r: { x: 120, y: 340, w: 840, h: 1080 }, color: INK },
      { k: "sticker", kind: "arrow", x: 900, y: 300, scale: 0.7, color: INK },
      { k: "sticker", kind: "heart", x: 150, y: 1440, scale: 0.5, color: "#c0392b" },
    ],
    headline: C("hand", 60, 0.76, { color: INK }), caption: C("mono", 20, 0.135, { color: "#69645f" }),
  },
  {
    id: "tapewall", name: "Tape Wall", blurb: "A photo taped at the corners to a concrete wall.",
    bg: { kind: "paper", color: "#c9c6c1" }, overlay: { strength: 0.5, color: "#c9c6c1" },
    frames: [{ slot: 0, r: { x: 130, y: 380, w: 820, h: 1000 }, shadow: true, border: "#000000" }],
    deco: [
      { k: "tape", x: 160, y: 400, rot: -40 }, { k: "tape", x: 920, y: 400, rot: 40 },
      { k: "tape", x: 160, y: 1360, rot: 40 }, { k: "tape", x: 920, y: 1360, rot: -40 },
    ],
    headline: C("sans", 46, 0.745, { color: INK }), caption: C("mono", 20, 0.135, { color: "#3a3530" }),
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
    id: "phone", name: "Phone Mockup", blurb: "Your photo on a phone screen held up against a soft colour.",
    bg: { kind: "color", color: "#e9d6d0" }, frames: [{ slot: 0, r: { x: 260, y: 400, w: 560, h: 1120 }, shape: "phone" }],
    headline: C("sans", 46, 0.135, { color: INK }), caption: C("serif", 26, 0.18, { color: "#69645f" }),
  },
  {
    id: "letter", name: "Typewriter Letter", blurb: "A typed letter on paper with a small polaroid clipped to it.",
    bg: { kind: "paper", color: "#efe6d2" }, overlay: { strength: 0.35, color: "#efe6d2" },
    frames: [{ slot: 0, r: { x: 610, y: 330, w: 340, h: 400 }, shape: "polaroid", rot: 5 }],
    under: Array.from({ length: 14 }, (_, k) => ({ k: "line" as const, x1: 80, y1: 900 + k * 46, x2: 1000, y2: 900 + k * 46, color: "#cdbfa5", lw: 1 })),
    deco: [{ k: "sticker", kind: "paperclip", x: 640, y: 320, scale: 0.8, rot: 10 }, { k: "sticker", kind: "stamp", x: 160, y: 1480, scale: 0.7, color: "#c03f13" }],
    headline: T("mono", 36, 0.08, 0.2, { color: INK, width: 0.48 }), caption: T("mono", 26, 0.08, 0.46, { color: "#3a3530", width: 0.84 }),
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
    id: "dategrid", name: "Date Grid", blurb: "A sky-blue page with a 3×3 grid of your photos and a big date.", capacity: 4,
    bg: { kind: "color", color: "#8fb6d9" },
    frames: [
      { slot: 0, r: { x: 110, y: 640, w: 270, h: 270 }, shape: "round", radius: 14 },
      { slot: 1, r: { x: 405, y: 640, w: 270, h: 270 }, shape: "round", radius: 14 },
      { slot: 2, r: { x: 700, y: 640, w: 270, h: 270 }, shape: "round", radius: 14 },
      { slot: 3, r: { x: 110, y: 935, w: 270, h: 270 }, shape: "round", radius: 14 },
    ],
    deco: [
      { k: "photo", slot: 0, r: { x: 405, y: 935, w: 270, h: 270 }, shape: "round", zoom: 1.8, dx: 0.2 },
      { k: "photo", slot: 1, r: { x: 700, y: 935, w: 270, h: 270 }, shape: "round", zoom: 1.6, dx: -0.2 },
      { k: "photo", slot: 2, r: { x: 110, y: 1230, w: 270, h: 270 }, shape: "round", zoom: 1.7, dy: 0.2 },
      { k: "photo", slot: 3, r: { x: 405, y: 1230, w: 270, h: 270 }, shape: "round", zoom: 1.5, dy: -0.2 },
      { k: "photo", slot: 0, r: { x: 700, y: 1230, w: 270, h: 270 }, shape: "round", zoom: 2.2, dx: -0.3 },
      { k: "text", text: "{day}", x: 980, y: 400, size: 120, font: "display", color: WHITE, align: "right" },
      { k: "text", text: "{MONTH}", x: 980, y: 530, size: 26, font: "mono", color: WHITE, align: "right" },
    ],
    headline: T("hand", 70, 0.1, 0.22, { color: WHITE, width: 0.55 }), caption: T("mono", 20, 0.1, 0.8, { color: WHITE }),
  },
  {
    id: "circlecollage", name: "Circle Collage", blurb: "A big circle crop beside squared tiles with bold copy.", capacity: 3,
    bg: { kind: "color", color: "#e9e6e1" },
    frames: [
      { slot: 0, r: { x: 60, y: 330, w: 620, h: 620 }, shape: "circle" },
      { slot: 1, r: { x: 710, y: 330, w: 310, h: 300 } },
      { slot: 2, r: { x: 710, y: 650, w: 310, h: 300 } },
    ],
    deco: [{ k: "photo", slot: 0, r: { x: 710, y: 970, w: 310, h: 300 }, zoom: 2 }],
    headline: T("sans", 70, 0.07, 0.53, { color: INK, width: 0.55 }), caption: T("serif", 26, 0.07, 0.72, { color: "#69645f", width: 0.55 }),
  },
  {
    id: "thumbrow", name: "Thumbnail Row", blurb: "Text up top, the photo below, and a row of three thumbnails.", capacity: 3,
    bg: { kind: "color", color: "#eeeeeb" },
    frames: [
      { slot: 0, r: { x: 0, y: 820, w: 1080, h: 1100 } },
      { slot: 1, r: { x: 120, y: 1280, w: 260, h: 180 }, shape: "round", radius: 16, border: WHITE, borderW: 6 },
      { slot: 2, r: { x: 410, y: 1280, w: 260, h: 180 }, shape: "round", radius: 16, border: WHITE, borderW: 6 },
    ],
    deco: [{ k: "photo", slot: 0, r: { x: 700, y: 1280, w: 260, h: 180 }, shape: "round", zoom: 1.8 }, { k: "text", text: "2K{yy}", x: 540, y: 270, size: 24, font: "mono", color: "#c03f13", align: "center" }],
    headline: C("sans", 74, 0.17, { color: INK, width: 0.7 }), caption: C("serif", 24, 0.33, { color: "#3a3530", width: 0.62 }),
  },
  {
    id: "boldquote", name: "Bold Quote", blurb: "Lime paper, a stack of photos and a loud stacked quote.", capacity: 3,
    bg: { kind: "color", color: "#e9ecb0" },
    frames: [
      { slot: 0, r: { x: 80, y: 280, w: 440, h: 520 } },
      { slot: 1, r: { x: 560, y: 280, w: 440, h: 330 } },
      { slot: 2, r: { x: 560, y: 630, w: 440, h: 330 } },
    ],
    deco: [{ k: "photo", slot: 0, r: { x: 80, y: 820, w: 440, h: 520 }, zoom: 1.6 }],
    headline: T("sans", 76, 0.53, 0.52, { color: "#1f3d1f", width: 0.43 }), caption: T("mono", 20, 0.08, 0.72, { color: "#1f3d1f" }),
    text: { headline: { lineHeight: 0.9 } },
  },
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
    id: "overlap", name: "Overlap", blurb: "Two frames overlapping on warm orange, one a little lower.", capacity: 2,
    bg: { kind: "color", color: "#d98a3d" },
    frames: [{ slot: 0, r: { x: 90, y: 330, w: 640, h: 820 } }, { slot: 1, r: { x: 350, y: 880, w: 640, h: 640 }, shadow: true }],
    headline: T("display", 60, 0.08, 0.135, { color: WHITE }), caption: T("mono", 20, 0.08, 0.79, { color: WHITE }),
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
  {
    id: "hstrip", name: "Strip Row", blurb: "Three photos in a white horizontal strip on a dark page.", capacity: 3,
    bg: { kind: "color", color: "#141312" },
    under: [{ k: "rect", r: { x: 60, y: 700, w: 960, h: 440 }, color: "#fbfaf6" }],
    frames: [
      { slot: 0, r: { x: 90, y: 730, w: 290, h: 380 } },
      { slot: 1, r: { x: 395, y: 730, w: 290, h: 380 } },
      { slot: 2, r: { x: 700, y: 730, w: 290, h: 380 } },
    ],
    headline: C("display", 64, 0.2, { color: WHITE }), caption: C("mono", 22, 0.66, { color: "#c9c2b8" }),
  },
  {
    id: "pillstack", name: "Pill Stack", blurb: "Three tall pill-shaped crops in a row on black.", capacity: 3,
    bg: { kind: "color", color: "#1d1d1b" },
    frames: [
      { slot: 0, r: { x: 110, y: 380, w: 270, h: 980 }, shape: "pill" },
      { slot: 1, r: { x: 405, y: 330, w: 270, h: 980 }, shape: "pill" },
      { slot: 2, r: { x: 700, y: 430, w: 270, h: 980 }, shape: "pill" },
    ],
    headline: C("display", 56, 0.135, { color: WHITE }), caption: C("mono", 20, 0.775, { color: "#c9c2b8" }),
  },
  {
    id: "ninegrid", name: "Nine Grid", blurb: "A 3×3 grid mixing your photos and close crops, title on top.", capacity: 4,
    bg: { kind: "color", color: "#141312" },
    frames: [
      { slot: 0, r: { x: 82, y: 420, w: 300, h: 300 } },
      { slot: 1, r: { x: 397, y: 735, w: 300, h: 300 } },
      { slot: 2, r: { x: 712, y: 1050, w: 300, h: 300 } },
      { slot: 3, r: { x: 712, y: 420, w: 300, h: 300 } },
    ],
    deco: [
      { k: "photo", slot: 0, r: { x: 397, y: 420, w: 300, h: 300 }, zoom: 2 },
      { k: "photo", slot: 1, r: { x: 82, y: 735, w: 300, h: 300 }, zoom: 2.1 },
      { k: "photo", slot: 2, r: { x: 712, y: 735, w: 300, h: 300 }, zoom: 1.8 },
      { k: "photo", slot: 3, r: { x: 82, y: 1050, w: 300, h: 300 }, zoom: 2 },
      { k: "photo", slot: 0, r: { x: 397, y: 1050, w: 300, h: 300 }, zoom: 2.6, dx: 0.3 },
    ],
    headline: C("display", 60, 0.135, { color: WHITE }), caption: C("mono", 20, 0.735, { color: "#c9c2b8" }),
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
  {
    id: "stickerbomb", name: "Sticker Bomb", blurb: "A polaroid buried in stickers on dotted paper — maximum fun.",
    bg: { kind: "paper", color: "#f5efe6" }, overlay: { strength: 0.3, color: "#f5efe6" },
    under: [{ k: "dots", step: 44, color: INK, alpha: 0.14 }],
    frames: [{ slot: 0, r: { x: 200, y: 420, w: 680, h: 720 }, shape: "polaroid", rot: -3 }],
    deco: [
      { k: "sticker", kind: "star", x: 180, y: 360, scale: 0.8 }, { k: "sticker", kind: "heart", x: 900, y: 420, scale: 0.6, color: "#e85d8a" },
      { k: "sticker", kind: "flower", x: 930, y: 1100, scale: 0.8 }, { k: "sticker", kind: "daisy", x: 150, y: 1150, scale: 0.7 },
      { k: "sticker", kind: "bow", x: 540, y: 380, scale: 0.9 }, { k: "sticker", kind: "stamp", x: 880, y: 1450, scale: 0.7, color: "#c03f13" },
      { k: "sticker", kind: "sparkle", x: 260, y: 1460, scale: 0.6, color: "#d9a62e" },
    ],
    headline: C("hand", 56, 0.612, { color: INK }), caption: C("hand", 40, 0.73, { color: "#3a3530" }),
    text: { headline: { rotate: -0.05 } },
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
  { ...byId("archwindow"), id: "archnight", name: "Arch Night", blurb: "An arched photo glowing on midnight blue with a serif title.", bg: { kind: "color", color: "#14182b" }, overlay: undefined, frames: [{ slot: 0, r: { x: 210, y: 360, w: 660, h: 1000 }, shape: "arch", border: "#e8d9b0", borderW: 4 }], deco: [{ k: "sticker", kind: "star", x: 170, y: 420, scale: 0.4, color: "#e8d9b0" }, { k: "sticker", kind: "sparkle", x: 920, y: 600, scale: 0.5, color: "#e8d9b0" }], headline: C("display", 64, 0.725, { color: "#e8d9b0" }), caption: C("mono", 20, 0.135, { color: "#e8d9b0" }) },
  { ...byId("circleframe"), id: "circlesun", name: "Sun Circle", blurb: "A circle crop like a setting sun on terracotta.", bg: { kind: "color", color: "#c8643b" }, frames: [{ slot: 0, r: { x: 190, y: 380, w: 700, h: 700 }, shape: "circle" }], headline: C("hand", 80, 0.62, { color: "#fbe7d3" }), caption: C("mono", 20, 0.72, { color: "#fbe7d3" }) },
  { ...byId("pillstack"), id: "pillduo", name: "Pill Duo", blurb: "Two tall pill crops side by side on cream.", capacity: 2, bg: { kind: "color", color: "#efe9df" }, frames: [{ slot: 0, r: { x: 150, y: 380, w: 360, h: 1000 }, shape: "pill" }, { slot: 1, r: { x: 570, y: 480, w: 360, h: 1000 }, shape: "pill" }], headline: C("italic", 60, 0.135, { color: INK }), caption: C("mono", 20, 0.8, { color: "#69645f" }) },
  { ...byId("bigpolaroid"), id: "polaroidtilt", name: "Tilted Polaroid", blurb: "A strongly tilted polaroid on taped kraft paper.", bg: { kind: "paper", color: "#c9a77c" }, overlay: { strength: 0.4, color: "#c9a77c" }, frames: [{ slot: 0, r: { x: 190, y: 380, w: 700, h: 820 }, shape: "polaroid", rot: 7 }], deco: [{ k: "tape", x: 560, y: 360, rot: 4 }], headline: C("hand", 56, 0.69, { color: INK }), caption: C("mono", 20, 0.135, { color: "#3a2a18" }), text: { headline: { rotate: 0.12 } } },
  { ...byId("phone"), id: "phonedark", name: "Phone at Night", blurb: "Your photo on a phone screen floating on a night-blurred backdrop.", bg: { kind: "blur" }, overlay: { strength: 0.5, color: "#000000" }, headline: C("sans", 46, 0.135, { color: WHITE }), caption: C("serif", 26, 0.18, { color: "#d8d2c8" }) },
  { ...byId("tapewall"), id: "tapekraft", name: "Kraft Tape", blurb: "A photo taped to brown kraft paper with a stamped date.", bg: { kind: "paper", color: "#b88b5a" }, overlay: { strength: 0.45, color: "#b88b5a" }, deco: [{ k: "tape", x: 540, y: 380, rot: -3, w: 300 }, { k: "sticker", kind: "stamp", x: 900, y: 1450, scale: 0.7, color: "#c03f13" }], headline: C("hand", 56, 0.745, { color: "#2a1d10" }), caption: C("mono", 20, 0.135, { color: "#2a1d10" }) },
  { ...byId("notesapp"), id: "notesdark", name: "Dark Note", blurb: "A dark notes card with soft white type over the photo.", deco: [{ k: "rect", r: { x: 90, y: 1060, w: 900, h: 320 }, color: "#1c1c1e", alpha: 0.92, radius: 24 }, { k: "text", text: "‹ notes", x: 120, y: 1084, size: 26, font: "sans", color: "#f2c14e" }, { k: "line", x1: 120, y1: 1130, x2: 960, y2: 1130, color: "#3a3a3c", lw: 2 }], headline: T("serif", 34, 0.115, 0.6, { width: 0.77, color: WHITE }), caption: T("mono", 20, 0.115, 0.68, { color: "#a8a39b" }) },
  { ...byId("quotemarks"), id: "quotepaper", name: "Paper Quote", blurb: "A quote typeset on cream paper with a small photo below.", bg: { kind: "paper", color: "#f1ebe1" }, overlay: { strength: 0.3, color: "#f1ebe1" }, frames: [{ slot: 0, r: { x: 240, y: 1000, w: 600, h: 520 } }], deco: [{ k: "text", text: "“", x: 90, y: 300, size: 300, font: "display", color: "#c03f13" }, { k: "tape", x: 540, y: 1000, rot: -4 }], headline: T("italic", 62, 0.1, 0.27, { color: INK, width: 0.8 }), caption: T("mono", 20, 0.1, 0.46, { color: "#69645f" }) },
  { ...byId("filmborder"), id: "filmborderdark", name: "Dark Border", blurb: "The photo in a black border with a red date stamp, darkroom style.", bg: { kind: "color", color: "#0e0e0e" }, deco: [{ k: "grain", alpha: 0.12 }, { k: "text", text: "{stamp}", x: 980, y: 1430, size: 40, font: "mono", color: "#ff3b30", align: "right" }], headline: T("serif", 40, 0.06, 0.8, { width: 0.88, color: WHITE }), caption: T("mono", 20, 0.06, 0.135, { color: "#a8a39b" }) },
  { ...byId("blob"), id: "blobmint", name: "Mint Blob", blurb: "An organic blob crop on fresh mint with daisies.", bg: { kind: "color", color: "#cfe8d5" }, deco: [{ k: "sticker", kind: "daisy", x: 900, y: 400, scale: 0.9 }, { k: "sticker", kind: "daisy", x: 170, y: 1380, scale: 0.7 }], headline: C("hand", 64, 0.745, { color: "#1f4d33" }), caption: C("mono", 20, 0.135, { color: "#1f4d33" }) },
];

function byId(id: string): Spec {
  const s = SPECS.find((x) => x.id === id);
  if (!s) throw new Error(`no spec ${id}`);
  return s;
}

export const AESTHETIC_SPECS: Spec[] = [...SPECS, ...VARIANTS];

export const AESTHETIC_TEMPLATES = Object.fromEntries(AESTHETIC_SPECS.map((s) => [s.id, fromSpec(s)])) as Record<string, Template>;

export const AESTHETIC_IDS = AESTHETIC_SPECS.map((s) => s.id) as TemplateId[];
