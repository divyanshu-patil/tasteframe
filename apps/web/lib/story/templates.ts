// Curated, deterministic template catalogue. Compositions are modelled on the Pinterest
// references in design-refs/pinterest (see design-refs/README.md) — each is a different
// composition, not a recolor. Ids must match apps/api/app/services/recommendations/layouts.py.
import {
  type Ctx,
  type Photo,
  type TextOpts,
  drawBlurred,
  drawGrain,
  drawPhoto,
  drawText,
  fontString,
  readableOn,
  rgba,
  rng,
  roundRect,
  star,
} from "./draw";
import type { Rect, StoryState, TemplateId, TemplateInput, TextKey, TextLayer } from "./types";
import { STORY_H as H, STORY_W as W } from "./types";

export interface Template {
  id: TemplateId;
  name: string;
  blurb: string;
  overlayLabel: string;
  decorations: { key: string; label: string; on: boolean }[];
  defaults(input: TemplateInput): Omit<StoryState, "templateId" | "crop" | "palette" | "stamp" | "accent">;
  draw(ctx: Ctx, photo: Photo, s: StoryState): void;
  after?(ctx: Ctx, s: StoryState): void;
  text?: Partial<Record<TextKey, TextOpts>>;
}

const t = (p: Partial<TextLayer> & Pick<TextLayer, "text">): TextLayer => ({
  size: 48,
  color: "#1d1d1b",
  align: "left",
  x: 0.08,
  y: 0.5,
  width: 0.84,
  font: "serif",
  ...p,
});
const decos = (list: [string, string, boolean][]) =>
  list.map(([key, label, on]) => ({ key, label, on }));
const on = (s: StoryState, key: string) => s.decorations[key] !== false;

const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }).toLowerCase();
const pad = (n: number) => String(n).padStart(2, "0");

const cinematic: Template = {
  id: "cinematic",
  name: "Cinematic",
  blurb: "Full-bleed frame, graded shadow, a single line of serif.",
  overlayLabel: "Shadow gradient",
  decorations: decos([
    ["letterbox", "Letterbox bars", false],
    ["grain", "Film grain", true],
  ]),
  defaults: (i) => ({
    headline: t({
      text: i.headline, size: 104, font: "display", align: "center", x: 0.5, y: 0.6, width: 0.86,
      color: readableOn("#0b0a09", i.accent === "#c03f13" ? "#f2b84b" : i.accent),
    }),
    caption: t({
      text: i.caption || fmtDate(i.date), size: 38, font: "italic", align: "center", x: 0.5,
      y: 0.74, width: 0.8, color: "#f4efe6",
    }),
    overlay: { strength: 0.72, color: "#0b0a09" },
    decorations: { letterbox: false, grain: true },
  }),
  draw(ctx, photo, s) {
    drawPhoto(ctx, photo, { x: 0, y: 0, w: W, h: H }, s.crop);
    const g = ctx.createLinearGradient(0, H * 0.38, 0, H);
    g.addColorStop(0, rgba(s.overlay.color, 0));
    g.addColorStop(0.55, rgba(s.overlay.color, s.overlay.strength * 0.85));
    g.addColorStop(1, rgba(s.overlay.color, s.overlay.strength));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (on(s, "letterbox")) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, 170);
      ctx.fillRect(0, H - 170, W, 170);
    }
  },
  after: (ctx, s) => on(s, "grain") && drawGrain(ctx, 0.12, 11),
  text: { headline: { shadow: true }, caption: { shadow: true } },
};

const stills: Template = {
  id: "stills",
  name: "Film Stills",
  blurb: "Three stills from one photo, with subtitles.",
  overlayLabel: "Frame tint",
  decorations: decos([
    ["timecode", "Timecode", true],
    ["grain", "Film grain", true],
  ]),
  defaults: (i) => ({
    headline: t({ text: i.headline, size: 42, font: "italic", align: "center", x: 0.5, y: 0.305, width: 0.8, color: "#fff7d6" }),
    caption: t({ text: i.caption || fmtDate(i.date), size: 38, font: "italic", align: "center", x: 0.5, y: 0.59, width: 0.8, color: "#fff7d6" }),
    overlay: { strength: 0.12, color: "#000000" },
    decorations: { timecode: true, grain: true },
  }),
  draw(ctx, photo, s) {
    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, W, H);
    const h = 524;
    [150, 698, 1246].forEach((y, i) => {
      drawPhoto(ctx, photo, { x: 0, y, w: W, h }, s.crop, (i - 1) * 0.28);
      ctx.fillStyle = rgba(s.overlay.color, s.overlay.strength);
      ctx.fillRect(0, y, W, h);
    });
    if (on(s, "timecode")) {
      ctx.font = fontString("mono", 24);
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.textBaseline = "top";
      ctx.fillText(`00:${s.stamp.slice(-5).replace(" ", ":")}:08`, 40, 178);
    }
  },
  after: (ctx, s) => on(s, "grain") && drawGrain(ctx, 0.1, 5),
  text: { headline: { shadow: true }, caption: { shadow: true } },
};

const editorial: Template = {
  id: "editorial",
  name: "Editorial",
  blurb: "Grid paper, an asymmetric photo band and big lowercase type.",
  overlayLabel: "Paper & grid",
  decorations: decos([
    ["grid", "Grid paper", true],
    ["swatches", "Palette swatches", true],
    ["numerals", "Date numerals", true],
    ["brackets", "Corner brackets", true],
  ]),
  defaults: (i) => ({
    headline: t({ text: i.headline.toLowerCase(), size: 104, font: "sans", x: 0.07, y: 0.515, width: 0.48 }),
    caption: t({ text: i.caption || fmtDate(i.date), size: 30, font: "serif", x: 0.62, y: 0.545, width: 0.31, color: "#2b2a28" }),
    overlay: { strength: 0.5, color: "#efede7" },
    decorations: { grid: true, swatches: true, numerals: true, brackets: true },
  }),
  draw(ctx, photo, s) {
    const ink = readableOn(s.overlay.color, "#1d1d1b");
    ctx.fillStyle = s.overlay.color;
    ctx.fillRect(0, 0, W, H);
    if (on(s, "grid")) {
      ctx.strokeStyle = rgba(ink, 0.12 * s.overlay.strength * 2);
      ctx.lineWidth = 1.5;
      for (let x = 0; x <= W; x += 54) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = 0; y <= H; y += 54) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
    }
    ctx.fillStyle = ink;
    ctx.textBaseline = "top";
    ctx.font = fontString("mono", 22);
    ctx.fillText("CREATIVE STORY", 76, 286);
    ctx.fillText(`2K${s.stamp.slice(1, 3)}`, 76, 330);
    ctx.font = fontString("mono", 22);
    ctx.fillText("← nature's atmosphere", 76, 374);
    if (on(s, "swatches")) {
      s.palette.slice(0, 3).forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.fillRect(860 + i * 52, 300 + (i % 2) * 34, 44, 44);
      });
    }
    drawPhoto(ctx, photo, { x: 0, y: 440, w: W, h: 500 }, s.crop);
    if (on(s, "numerals")) {
      ctx.save();
      ctx.font = fontString("sans", 300);
      ctx.textAlign = "right";
      ctx.strokeStyle = rgba(ink, 0.16);
      ctx.lineWidth = 3;
      ctx.strokeText(s.stamp.slice(-2), 1040, 1180);
      ctx.restore();
    }
    if (on(s, "brackets")) {
      ctx.strokeStyle = ink;
      ctx.lineWidth = 3;
      const L = (x: number, y: number, dx: number, dy: number) => {
        ctx.beginPath(); ctx.moveTo(x + dx, y); ctx.lineTo(x, y); ctx.lineTo(x, y + dy); ctx.stroke();
      };
      L(624, 1022, 34, 34);
      L(1010, 1430, -34, -34);
    }
    ctx.font = fontString("mono", 20);
    ctx.fillStyle = rgba(ink, 0.7);
    ctx.textAlign = "left";
    ctx.fillText("camera — tasteframe", 76, 1520);
    ctx.textAlign = "right";
    ctx.fillText("archive by you", 1004, 1520);
    ctx.textAlign = "left";
  },
  text: { headline: { lineHeight: 0.92, tracking: -0.045 }, caption: { lineHeight: 1.3 } },
};

const journal: Template = {
  id: "journal",
  name: "Journal",
  blurb: "A paper card over your blurred photo — date, title, a few lines.",
  overlayLabel: "Backdrop tint",
  decorations: decos([
    ["quote", "Quote mark", true],
    ["footer", "Footer line", true],
  ]),
  defaults: (i) => ({
    headline: t({ text: i.headline, size: 76, font: "display", x: 0.13, y: 0.215, width: 0.38 }),
    caption: t({ text: i.caption || "a quiet note to keep.", size: 27, font: "serif", x: 0.54, y: 0.235, width: 0.33, color: "#333230" }),
    overlay: { strength: 0.25, color: "#000000" },
    decorations: { quote: true, footer: true },
  }),
  draw(ctx, photo, s) {
    drawBlurred(ctx, photo, { x: 0, y: 0, w: W, h: H }, s.crop);
    ctx.fillStyle = rgba(s.overlay.color, s.overlay.strength);
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.25)";
    ctx.shadowBlur = 40;
    ctx.fillStyle = "#fbfaf7";
    ctx.fillRect(90, 290, 900, 1290);
    ctx.restore();
    ctx.fillStyle = "#1d1d1b";
    ctx.textBaseline = "top";
    ctx.font = fontString("serif", 26);
    ctx.fillText(s.stamp.length ? s.stamp.replace(/^'(\d\d) (\d\d) (\d\d)$/, "$3.$2.20$1") : "", 140, 350);
    if (on(s, "quote")) {
      ctx.fillStyle = s.accent;
      ctx.font = fontString("display", 140);
      ctx.fillText("“", 560, 300);
    }
    drawPhoto(ctx, photo, { x: 150, y: 800, w: 780, h: 640 }, s.crop);
    if (on(s, "footer")) {
      ctx.fillStyle = "#6b665f";
      ctx.font = fontString("mono", 18);
      ctx.textAlign = "center";
      ctx.fillText("typography / daily story / quotes of the day", W / 2, 1490);
      ctx.textAlign = "left";
    }
  },
  text: { headline: { lineHeight: 0.95 }, caption: { lineHeight: 1.35 } },
};

function tornRect(ctx: Ctx, r: Rect, seed: number) {
  const rand = rng(seed);
  ctx.beginPath();
  ctx.moveTo(r.x, r.y);
  for (let x = r.x; x <= r.x + r.w; x += 18) ctx.lineTo(x, r.y + rand() * 10);
  for (let y = r.y; y <= r.y + r.h; y += 18) ctx.lineTo(r.x + r.w - rand() * 8, y);
  for (let x = r.x + r.w; x >= r.x; x -= 18) ctx.lineTo(x, r.y + r.h - rand() * 10);
  for (let y = r.y + r.h; y >= r.y; y -= 18) ctx.lineTo(r.x + rand() * 8, y);
  ctx.closePath();
}

function tape(ctx: Ctx, cx: number, cy: number, angle: number, color: string) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.fillStyle = rgba(color, 0.78);
  ctx.fillRect(-110, -32, 220, 64);
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  for (let x = -100; x < 110; x += 36) ctx.fillRect(x, -32, 14, 64);
  ctx.restore();
}

/** Perforated postage stamp with an ember sunburst (DESIGN.md "Stamp Seal"). */
function stamp(ctx: Ctx, x: number, y: number, s: StoryState) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(0.08);
  ctx.fillStyle = "#f6f1e7";
  roundRect(ctx, { x: 0, y: 0, w: 170, h: 210 }, 12);
  ctx.fill();
  ctx.fillStyle = "#efe6d8";
  for (let i = 10; i < 170; i += 20) {
    for (const yy of [0, 210]) { ctx.beginPath(); ctx.arc(i, yy, 6, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.fillStyle = "#c03f13";
  star(ctx, 85, 90, 56, 16, 0.55);
  ctx.fill();
  ctx.fillStyle = "#1d1d1b";
  ctx.font = fontString("mono", 14);
  ctx.textBaseline = "top";
  ctx.fillText(`NO. ${s.stamp.replace(/\D/g, "")}`, 20, 170);
  ctx.restore();
}

const scrapbook: Template = {
  id: "scrapbook",
  name: "Scrapbook",
  blurb: "A tilted polaroid with washi tape, stars and a handwritten note.",
  overlayLabel: "Paper",
  decorations: decos([
    ["dots", "Dot grid", true],
    ["tape", "Washi tape", true],
    ["stars", "Gold stars", true],
    ["note", "Torn note", true],
    ["stamp", "Postage stamp", true],
  ]),
  defaults: (i) => ({
    headline: t({ text: i.headline, size: 74, font: "hand", align: "center", x: 0.5, y: 0.607, width: 0.62 }),
    caption: t({ text: i.caption || fmtDate(i.date), size: 44, font: "hand", x: 0.15, y: 0.745, width: 0.5, color: "#3a3530" }),
    overlay: { strength: 0.35, color: "#efe6d8" },
    decorations: { dots: true, tape: true, stars: true, note: true, stamp: true },
  }),
  draw(ctx, photo, s) {
    ctx.fillStyle = s.overlay.color;
    ctx.fillRect(0, 0, W, H);
    drawGrain(ctx, s.overlay.strength * 0.25, 3);
    if (on(s, "dots")) {
      ctx.fillStyle = "rgba(29,29,27,0.14)";
      for (let x = 30; x < W; x += 44) for (let y = 30; y < H; y += 44) ctx.fillRect(x, y, 4, 4);
    }
    ctx.save();
    ctx.translate(540, 840);
    ctx.rotate(-0.05);
    ctx.shadowColor = "rgba(29,29,27,0.28)";
    ctx.shadowBlur = 30;
    ctx.shadowOffsetX = -8;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = "#fdfcf8";
    ctx.fillRect(-380, -460, 760, 900);
    ctx.restore();
    ctx.save();
    ctx.translate(540, 840);
    ctx.rotate(-0.05);
    ctx.translate(-540, -840);
    drawPhoto(ctx, photo, { x: 200, y: 420, w: 680, h: 690 }, s.crop);
    ctx.restore();
    if (on(s, "tape")) {
      tape(ctx, 220, 400, -0.65, s.palette[1] ?? s.accent);
      tape(ctx, 870, 370, 0.55, s.palette[2] ?? s.accent);
    }
    if (on(s, "stars")) {
      ctx.fillStyle = "#d9a62e";
      ctx.strokeStyle = "#9c7414";
      ctx.lineWidth = 3;
      for (const [x, y, r] of [[150, 330, 62], [215, 450, 34], [940, 1250, 46]] as const) {
        star(ctx, x, y, r);
        ctx.fill();
        ctx.stroke();
      }
    }
    if (on(s, "note")) {
      ctx.save();
      ctx.translate(410, 1490);
      ctx.rotate(0.025);
      ctx.translate(-410, -1490);
      ctx.fillStyle = "#fbf6ea";
      ctx.shadowColor = "rgba(0,0,0,0.12)";
      ctx.shadowBlur = 12;
      tornRect(ctx, { x: 120, y: 1405, w: 600, h: 150 }, 21);
      ctx.fill();
      ctx.restore();
    }
    if (on(s, "stamp")) stamp(ctx, 800, 1330, s);
  },
  text: { headline: { rotate: -0.05, lineHeight: 1 }, caption: { rotate: 0.025, lineHeight: 1 } },
};

const filmstrip: Template = {
  id: "filmstrip",
  name: "Film Strip",
  blurb: "A 35mm strip with sprockets, edge codes and a tape label.",
  overlayLabel: "Background",
  decorations: decos([
    ["tilt", "Tilted strip", true],
    ["codes", "Edge codes", true],
    ["label", "Tape label", true],
  ]),
  defaults: (i) => ({
    headline: t({ text: i.headline, size: 62, font: "hand", align: "center", x: 0.5, y: 0.735, width: 0.42 }),
    caption: t({ text: i.caption || fmtDate(i.date), size: 24, font: "mono", align: "center", x: 0.5, y: 0.8, width: 0.86, color: "#e8a33d" }),
    overlay: { strength: 0.35, color: "#141210" },
    decorations: { tilt: true, codes: true, label: true },
  }),
  draw(ctx, photo, s) {
    ctx.fillStyle = s.overlay.color;
    ctx.fillRect(0, 0, W, H);
    drawGrain(ctx, s.overlay.strength * 0.3, 9);
    ctx.save();
    if (on(s, "tilt")) {
      ctx.translate(W / 2, 830);
      ctx.rotate(-0.035);
      ctx.translate(-W / 2, -830);
    }
    ctx.fillStyle = "#1b1815";
    ctx.fillRect(170, 190, 740, 1320);
    ctx.fillStyle = "#e9e4da";
    for (let y = 210; y < 1500; y += 56) {
      roundRect(ctx, { x: 192, y, w: 34, h: 24 }, 5); ctx.fill();
      roundRect(ctx, { x: 854, y, w: 34, h: 24 }, 5); ctx.fill();
    }
    [230, 650, 1070].forEach((y, i) =>
      drawPhoto(ctx, photo, { x: 250, y, w: 580, h: 390 }, s.crop, (i - 1) * 0.3),
    );
    if (on(s, "codes")) {
      ctx.fillStyle = "#e8a33d";
      ctx.font = fontString("mono", 22);
      ctx.textBaseline = "top";
      ["4", "3A", "3", "2A", "2"].forEach((c, i) => {
        ctx.fillText(c, 234, 260 + i * 270);
        ctx.fillText(c, 834 - ctx.measureText(c).width, 395 + i * 270);
      });
    }
    ctx.restore();
    if (on(s, "label")) {
      ctx.save();
      ctx.translate(540, 1440);
      ctx.rotate(-0.04);
      ctx.fillStyle = "#f3ead6";
      ctx.fillRect(-250, -62, 500, 124);
      ctx.restore();
    }
  },
  text: { headline: { rotate: -0.04, lineHeight: 1 } },
};

const vintage: Template = {
  id: "vintage",
  name: "Vintage",
  blurb: "Warm grade, light leaks, dust and an orange date stamp.",
  overlayLabel: "Warm grade",
  decorations: decos([
    ["leak", "Light leak", true],
    ["dust", "Dust & scratches", true],
    ["date", "Date stamp", true],
    ["grain", "Film grain", true],
  ]),
  defaults: (i) => ({
    headline: t({ text: i.headline, size: 96, font: "italic", x: 0.08, y: 0.15, width: 0.8, color: "#f6ead7" }),
    caption: t({ text: i.caption || fmtDate(i.date), size: 36, font: "italic", x: 0.08, y: 0.27, width: 0.7, color: "#f6ead7" }),
    overlay: { strength: 0.4, color: "#d9822b" },
    decorations: { leak: true, dust: true, date: true, grain: true },
  }),
  draw(ctx, photo, s) {
    drawPhoto(ctx, photo, { x: 0, y: 0, w: W, h: H }, s.crop);
    ctx.save();
    ctx.globalCompositeOperation = "soft-light";
    ctx.fillStyle = rgba(s.overlay.color, s.overlay.strength);
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighten";
    ctx.fillStyle = rgba("#3a2a1a", 0.35 * s.overlay.strength);
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    if (on(s, "leak")) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      for (const [x, y, r, c, a] of [
        [W + 60, 520, 720, "#ff7a1a", 0.55],
        [-80, 1600, 620, "#d1301b", 0.4],
      ] as const) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, rgba(c, a));
        g.addColorStop(1, rgba(c, 0));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
      ctx.restore();
    }
    if (on(s, "dust")) {
      const rand = rng(42);
      ctx.fillStyle = "rgba(255,248,235,0.55)";
      for (let i = 0; i < 90; i++) {
        ctx.beginPath();
        ctx.arc(rand() * W, rand() * H, rand() * 2.6 + 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = "rgba(255,248,235,0.25)";
      ctx.lineWidth = 1.5;
      for (const x of [rand() * W, rand() * W]) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 18, H); ctx.stroke();
      }
    }
    if (on(s, "date")) {
      ctx.save();
      ctx.font = fontString("mono", 46);
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      ctx.fillStyle = "#ff8a2a";
      ctx.shadowColor = "rgba(255,110,20,0.9)";
      ctx.shadowBlur = 16;
      ctx.fillText(s.stamp, 1000, 1480);
      ctx.restore();
    }
  },
  after: (ctx, s) => on(s, "grain") && drawGrain(ctx, 0.16, 13),
  text: { headline: { shadow: true, lineHeight: 1 }, caption: { shadow: true } },
};

const minimal: Template = {
  id: "minimal",
  name: "Minimal",
  blurb: "One framed photo on a dark matte, quiet type underneath.",
  overlayLabel: "Matte",
  decorations: decos([
    ["border", "White border", true],
    ["offset", "Offset second frame", true],
  ]),
  defaults: (i) => ({
    headline: t({ text: i.headline, size: 52, font: "display", align: "right", x: 0.86, y: 0.752, width: 0.7, color: "#f4efe6" }),
    caption: t({ text: i.caption || fmtDate(i.date), size: 22, font: "mono", align: "right", x: 0.86, y: 0.792, width: 0.7, color: "#a39d94" }),
    overlay: { strength: 1, color: "#151413" },
    decorations: { border: true, offset: true },
  }),
  draw(ctx, photo, s) {
    ctx.fillStyle = s.overlay.color;
    ctx.fillRect(0, 0, W, H);
    const frame = (r: Rect, shift: number) => {
      if (on(s, "border")) {
        ctx.fillStyle = "#f4efe6";
        ctx.fillRect(r.x - 10, r.y - 10, r.w + 20, r.h + 20);
      }
      drawPhoto(ctx, photo, r, s.crop, shift);
    };
    frame({ x: 150, y: 440, w: 780, h: 960 }, 0);
    if (on(s, "offset")) frame({ x: 610, y: 320, w: 380, h: 300 }, -0.3);
  },
};

export const TEMPLATES: Record<TemplateId, Template> = {
  cinematic, stills, editorial, journal, scrapbook, filmstrip, vintage, minimal,
};

export function stampFor(date: Date): string {
  return `'${String(date.getFullYear()).slice(-2)} ${pad(date.getMonth() + 1)} ${pad(date.getDate())}`;
}

export function defaultState(id: TemplateId, input: TemplateInput): StoryState {
  const tpl = TEMPLATES[id];
  return {
    templateId: id,
    crop: { zoom: 1, x: 0.5, y: 0.5 },
    accent: input.accent,
    palette: input.palette.length ? input.palette : [input.accent],
    stamp: stampFor(input.date),
    ...tpl.defaults(input),
  };
}

export interface HitBoxes {
  headline: Rect;
  caption: Rect;
}

/** Render a story into a context already scaled to 1080×1920 units. Pure and deterministic. */
export function renderStory(ctx: Ctx, photo: Photo, s: StoryState): HitBoxes {
  const tpl = TEMPLATES[s.templateId];
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  tpl.draw(ctx, photo, s);
  const headline = drawText(ctx, s.headline, tpl.text?.headline);
  const caption = drawText(ctx, s.caption, tpl.text?.caption);
  tpl.after?.(ctx, s);
  ctx.restore();
  return { headline, caption };
}
