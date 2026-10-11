// Paper elements & stickers, modelled on design-refs/pinterest/{stickers,scrapbook,notes,photodump}.
// All drawn as vectors (no copied artwork); deterministic, serializable, draggable in the editor.
import { type Ctx, fontString, rgba, rng, roundRect, star } from "./draw";
import { ELEMENT_FILES, drawElement, isElement } from "./elements";
import type { Photo } from "./draw";
import type { Rect } from "./types";
import { STORY_H as H, STORY_W as W } from "./types";

export const STICKER_KINDS = [
  { kind: "tape", label: "Washi tape", color: "#d9a3a0" },
  { kind: "star", label: "Gold star", color: "#d9a62e" },
  { kind: "sparkle", label: "Sparkle", color: "#f4efe6" },
  { kind: "heart", label: "Heart", color: "#d4536b" },
  { kind: "flower", label: "Flower", color: "#7d9bd1" },
  { kind: "daisy", label: "Daisy", color: "#f7f3e8" },
  { kind: "bow", label: "Bow", color: "#c9a7a4" },
  { kind: "paperclip", label: "Paperclip", color: "#9a958e" },
  { kind: "pin", label: "Push pin", color: "#c0392b" },
  { kind: "stamp", label: "Stamp", color: "#c03f13" },
  { kind: "arrow", label: "Doodle arrow", color: "#f4efe6" },
  { kind: "swirl", label: "Swirl", color: "#f4efe6" },
  { kind: "note", label: "Torn note", color: "#fbf6ea" },
  { kind: "player", label: "Mini player", color: "#f4efe6" },
  // Transparent-PNG elements (elements.ts).
  { kind: "kiss", label: "Lipstick kiss", color: "#c41630" },
  { kind: "kissblur", label: "Lipstick blur", color: "#e84a54" },
  { kind: "brackets", label: "Focus brackets", color: "#40dc6e" },
  { kind: "rec", label: "REC", color: "#e61e1e" },
  { kind: "tornstrip", label: "Torn strip", color: "#faf8f2" },
  { kind: "folder", label: "Folder", color: "#fac43c" },
  { kind: "cursor", label: "Cursor", color: "#ffffff" },
  { kind: "warning", label: "Warning", color: "#ffd600" },
  { kind: "cat", label: "Cat doodle", color: "#ffffff" },
  { kind: "faceheart", label: "Cheek heart", color: "#ffffff" },
  { kind: "barcode", label: "Barcode", color: "#111111" },
  { kind: "chromestar", label: "Chrome star", color: "#d8d8dc" },
  { kind: "chromesparkle", label: "Chrome sparkle", color: "#d8d8dc" },
  { kind: "exclaim", label: "!!", color: "#d62228" },
  { kind: "anger", label: "Anger mark", color: "#d2282e" },
  { kind: "owocat", label: "OwO cat", color: "#ffffff" },
  { kind: "headcat", label: "Headphone cat", color: "#e29654" },
  { kind: "spotify", label: "Playlist panel", color: "#1ed760" },
] as const;
export type StickerKind = (typeof STICKER_KINDS)[number]["kind"];

export interface Sticker {
  id: string;
  kind: StickerKind;
  x: number; // 0..1 centre
  y: number;
  scale: number; // 0.4..3
  rotate: number; // degrees
  color: string;
  text?: string; // note / player label
  /** Placed by the layout (swapped out when switching layouts); user stickers stay. */
  layout?: boolean;
}

const BASE = 150; // px at scale 1
/** The playlist panel's natural size at scale 1 (Story px). */
export const PANEL = { w: 620, h: 1040 };

/** Unrotated size of a sticker, Story px. */
export function stickerSize(s: Pick<Sticker, "kind" | "scale">): { w: number; h: number } {
  if (s.kind === "spotify") return { w: PANEL.w * s.scale, h: PANEL.h * s.scale };
  if (isElement(s.kind)) {
    const { w, h } = ELEMENT_FILES[s.kind];
    const k = (BASE * 1.6 * s.scale) / Math.max(w, h);
    return { w: w * k, h: h * k };
  }
  const side = BASE * s.scale * (s.kind === "note" || s.kind === "player" || s.kind === "tape" ? 1.6 : 1);
  return { w: side, h: side };
}

/** Axis-aligned box around the (rotated) sticker — hit-testing and the selection outline. */
export function stickerBounds(s: Sticker): Rect {
  const { w, h } = stickerSize(s);
  const a = (s.rotate * Math.PI) / 180;
  const bw = Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a));
  const bh = Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a));
  return { x: s.x * W - bw / 2, y: s.y * H - bh / 2, w: bw, h: bh };
}

/** Track rows for the playlist panel — real catalogue data only (never invented). */
export interface PanelTrack {
  title: string;
  artist: string;
  explicit?: boolean;
  trackId?: number;
}
export interface StickerExtras {
  tracks?: PanelTrack[];
  art?: Map<number, Photo>;
  /** Fallback thumbnails when a track has no artwork loaded. */
  photo?: Photo;
}

/** Spotify-style playlist table (desktop), drawn centred at the origin. */
function playlistPanel(ctx: Ctx, s: Sticker, x: StickerExtras) {
  const k = s.scale;
  ctx.save();
  ctx.scale(k, k);
  ctx.translate(-PANEL.w / 2, -PANEL.h / 2);
  ctx.fillStyle = "#121212";
  ctx.fillRect(0, 0, PANEL.w, PANEL.h);
  // Action row: green play button, then outline icons.
  ctx.fillStyle = "#1ed760";
  ctx.beginPath();
  ctx.arc(64, 70, 38, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.moveTo(54, 50);
  ctx.lineTo(82, 70);
  ctx.lineTo(54, 90);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#b3b3b3";
  ctx.lineWidth = 3.5;
  ctx.lineCap = "round";
  // shuffle
  ctx.beginPath();
  ctx.moveTo(130, 56); ctx.bezierCurveTo(150, 56, 160, 84, 180, 84);
  ctx.moveTo(130, 84); ctx.bezierCurveTo(150, 84, 160, 56, 180, 56);
  ctx.stroke();
  // download (circle + arrow)
  ctx.beginPath();
  ctx.arc(222, 70, 17, 0, Math.PI * 2);
  ctx.moveTo(222, 60); ctx.lineTo(222, 79); ctx.moveTo(214, 72); ctx.lineTo(222, 80); ctx.lineTo(230, 72);
  ctx.stroke();
  // add user
  ctx.beginPath();
  ctx.arc(270, 62, 9, 0, Math.PI * 2);
  ctx.moveTo(254, 88); ctx.quadraticCurveTo(270, 70, 286, 88);
  ctx.moveTo(292, 64); ctx.lineTo(292, 80); ctx.moveTo(284, 72); ctx.lineTo(300, 72);
  ctx.stroke();
  // more ⋯
  ctx.fillStyle = "#b3b3b3";
  for (const dx of [0, 12, 24]) {
    ctx.beginPath();
    ctx.arc(330 + dx, 70, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Header
  ctx.font = fontString("sans", 22);
  ctx.textBaseline = "middle";
  ctx.fillText("#", 34, 150);
  ctx.fillText("Title", 84, 150);
  ctx.fillStyle = "#2a2a2a";
  ctx.fillRect(24, 172, PANEL.w - 48, 2);
  const rows = 10;
  const rh = (PANEL.h - 196) / rows;
  const tracks = x.tracks ?? [];
  for (let i = 0; i < rows; i++) {
    const y = 190 + i * rh;
    const t = tracks[i];
    ctx.fillStyle = "#b3b3b3";
    ctx.font = fontString("sans", 22);
    ctx.textAlign = "center";
    ctx.fillText(String(i + 1), 40, y + rh / 2);
    ctx.textAlign = "left";
    const art = { x: 74, y: y + (rh - 58) / 2, w: 58, h: 58 };
    const img = (t?.trackId && x.art?.get(t.trackId)) || x.photo;
    ctx.save();
    roundRect(ctx, art, 4);
    ctx.clip();
    if (img) {
      const side = Math.min(img.width, img.height);
      const shift = t?.trackId && x.art?.get(t.trackId) ? 0 : (i * 0.13) % 0.5; // vary fallback crops
      ctx.drawImage(img, (img.width - side) * (0.25 + shift), (img.height - side) / 2, side, side, art.x, art.y, art.w, art.h);
    } else {
      ctx.fillStyle = "#333";
      ctx.fillRect(art.x, art.y, art.w, art.h);
    }
    ctx.restore();
    const tx = 150;
    if (t) {
      ctx.fillStyle = "#ffffff";
      ctx.font = fontString("sans", 25);
      ctx.fillText(t.title, tx, y + rh / 2 - 15, PANEL.w - tx - 24);
      let ax = tx;
      if (t.explicit) {
        ctx.fillStyle = "#b3b3b3";
        roundRect(ctx, { x: ax, y: y + rh / 2 + 6, w: 20, h: 20 }, 3);
        ctx.fill();
        ctx.fillStyle = "#121212";
        ctx.font = fontString("sans", 15);
        ctx.textAlign = "center";
        ctx.fillText("E", ax + 10, y + rh / 2 + 17);
        ctx.textAlign = "left";
        ax += 28;
      }
      ctx.fillStyle = "#b3b3b3";
      ctx.font = fontString("sans", 20);
      ctx.fillText(t.artist, ax, y + rh / 2 + 17, PANEL.w - ax - 24);
    } else {
      ctx.fillStyle = "#2f2f2f";
      roundRect(ctx, { x: tx, y: y + rh / 2 - 22, w: 200 + ((i * 67) % 150), h: 16 }, 8);
      ctx.fill();
      ctx.fillStyle = "#262626";
      roundRect(ctx, { x: tx, y: y + rh / 2 + 8, w: 110 + ((i * 41) % 90), h: 12 }, 6);
      ctx.fill();
    }
  }
  ctx.restore();
}

function petals(ctx: Ctx, n: number, len: number, wid: number, fill: string, stroke?: string) {
  for (let i = 0; i < n; i++) {
    ctx.save();
    ctx.rotate((Math.PI * 2 * i) / n);
    ctx.beginPath();
    ctx.ellipse(0, -len / 2, wid, len / 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }
}

function heartPath(ctx: Ctx, size: number) {
  const s = size / 2;
  ctx.beginPath();
  ctx.moveTo(0, s * 0.75);
  ctx.bezierCurveTo(-s * 1.4, -s * 0.15, -s * 0.55, -s * 1.05, 0, -s * 0.4);
  ctx.bezierCurveTo(s * 0.55, -s * 1.05, s * 1.4, -s * 0.15, 0, s * 0.75);
  ctx.closePath();
}

/** Draw one sticker. Coordinates are in 1080×1920 story units. */
export function drawSticker(ctx: Ctx, s: Sticker, extras: StickerExtras = {}): void {
  const size = BASE * s.scale;
  ctx.save();
  ctx.translate(s.x * W, s.y * H);
  ctx.rotate((s.rotate * Math.PI) / 180);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (isElement(s.kind)) {
    drawElement(ctx, s.kind, size * 1.6);
    ctx.restore();
    return;
  }
  if (s.kind === "spotify") {
    playlistPanel(ctx, s, extras);
    ctx.restore();
    return;
  }
  switch (s.kind) {
    case "tape": {
      const w = size * 1.5;
      const h = size * 0.42;
      ctx.fillStyle = rgba(s.color, 0.82);
      ctx.beginPath();
      // Torn short edges.
      const rand = rng(Math.round(s.x * 997 + s.y * 131));
      ctx.moveTo(-w / 2, -h / 2);
      ctx.lineTo(w / 2, -h / 2);
      for (let y = -h / 2; y <= h / 2; y += h / 6) ctx.lineTo(w / 2 - rand() * 8, y);
      ctx.lineTo(-w / 2, h / 2);
      for (let y = h / 2; y >= -h / 2; y -= h / 6) ctx.lineTo(-w / 2 + rand() * 8, y);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      for (let x = -w / 2 + 10; x < w / 2 - 10; x += 34) ctx.fillRect(x, -h / 2, 12, h);
      break;
    }
    case "star":
      ctx.fillStyle = s.color;
      ctx.strokeStyle = rgba("#000000", 0.25);
      ctx.lineWidth = 3;
      star(ctx, 0, 0, size / 2);
      ctx.fill();
      ctx.stroke();
      break;
    case "sparkle": {
      ctx.fillStyle = s.color;
      ctx.shadowColor = rgba(s.color, 0.9);
      ctx.shadowBlur = size * 0.25;
      star(ctx, 0, 0, size / 2, 4, 0.18);
      ctx.fill();
      star(ctx, size * 0.42, -size * 0.32, size / 7, 4, 0.2);
      ctx.fill();
      break;
    }
    case "heart":
      ctx.fillStyle = "#ffffff";
      heartPath(ctx, size * 1.12);
      ctx.fill();
      ctx.fillStyle = s.color;
      heartPath(ctx, size);
      ctx.fill();
      break;
    case "flower":
      petals(ctx, 5, size * 0.55, size * 0.17, s.color, rgba("#1d1d1b", 0.15));
      ctx.fillStyle = "#f2d16b";
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.09, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "daisy":
      petals(ctx, 14, size * 0.6, size * 0.075, s.color, rgba("#1d1d1b", 0.12));
      ctx.fillStyle = "#e7b416";
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.13, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "bow": {
      ctx.fillStyle = s.color;
      ctx.strokeStyle = rgba("#1d1d1b", 0.25);
      ctx.lineWidth = 3;
      for (const dir of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(dir * size * 0.55, -size * 0.45, dir * size * 0.6, size * 0.2, 0, 0);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(dir * size * 0.28, size * 0.5);
        ctx.lineTo(dir * size * 0.12, size * 0.5);
        ctx.closePath();
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.08, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "paperclip": {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = size * 0.06;
      const w = size * 0.22;
      const h = size * 0.9;
      ctx.beginPath();
      ctx.moveTo(-w * 0.4, h * 0.25);
      ctx.lineTo(-w * 0.4, -h * 0.3);
      ctx.arc(0, -h * 0.3, w * 0.4, Math.PI, 0);
      ctx.lineTo(w * 0.4, h * 0.38);
      ctx.arc(-w * 0.1, h * 0.38, w * 0.5, 0, Math.PI);
      ctx.lineTo(-w * 0.6, -h * 0.42);
      ctx.stroke();
      break;
    }
    case "pin":
      ctx.strokeStyle = "#8a8580";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(size * 0.12, size * 0.42);
      ctx.stroke();
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(0, -size * 0.05, size * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.beginPath();
      ctx.arc(-size * 0.07, -size * 0.12, size * 0.06, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "stamp": {
      ctx.fillStyle = "#f6f1e7";
      roundRect(ctx, { x: -size * 0.42, y: -size * 0.5, w: size * 0.84, h: size }, 8);
      ctx.fill();
      ctx.fillStyle = s.color;
      star(ctx, 0, -size * 0.08, size * 0.28, 16, 0.55);
      ctx.fill();
      ctx.fillStyle = "#1d1d1b";
      ctx.font = fontString("mono", size * 0.09);
      ctx.textAlign = "center";
      ctx.fillText("POST · 26", 0, size * 0.38);
      break;
    }
    case "arrow": {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = size * 0.035;
      ctx.beginPath();
      ctx.moveTo(-size * 0.5, size * 0.3);
      ctx.bezierCurveTo(-size * 0.2, -size * 0.45, size * 0.1, size * 0.35, size * 0.45, -size * 0.2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(size * 0.45, -size * 0.2);
      ctx.lineTo(size * 0.22, -size * 0.18);
      ctx.moveTo(size * 0.45, -size * 0.2);
      ctx.lineTo(size * 0.38, 0.02 * size);
      ctx.stroke();
      break;
    }
    case "swirl": {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = size * 0.03;
      ctx.beginPath();
      for (let a = 0; a < Math.PI * 5; a += 0.08) {
        const r = (size * 0.45 * a) / (Math.PI * 5);
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.stroke();
      break;
    }
    case "note": {
      const w = size * 1.5;
      const h = size * 0.85;
      const rand = rng(Math.round(s.x * 733 + s.y * 377));
      ctx.fillStyle = s.color;
      ctx.shadowColor = "rgba(0,0,0,0.18)";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(-w / 2, -h / 2);
      for (let x = -w / 2; x <= w / 2; x += 16) ctx.lineTo(x, -h / 2 + rand() * 7);
      for (let x = w / 2; x >= -w / 2; x -= 16) ctx.lineTo(x, h / 2 - rand() * 7);
      ctx.closePath();
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.fillStyle = "#3a3530";
      ctx.font = fontString("hand", size * 0.2);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText((s.text ?? "keep this one ♡").slice(0, 28), 0, 0, w * 0.9);
      break;
    }
    case "player": {
      const w = size * 1.6;
      const h = size * 0.62;
      ctx.fillStyle = rgba("#1d1d1b", 0.72);
      roundRect(ctx, { x: -w / 2, y: -h / 2, w, h }, 22);
      ctx.fill();
      ctx.fillStyle = s.color;
      ctx.font = fontString("serif", size * 0.12);
      ctx.textBaseline = "top";
      ctx.fillText((s.text ?? "now playing").slice(0, 26), -w / 2 + 24, -h / 2 + 18, w - 48);
      ctx.fillStyle = rgba(s.color, 0.35);
      ctx.fillRect(-w / 2 + 24, 0, w - 48, 5);
      ctx.fillStyle = s.color;
      ctx.fillRect(-w / 2 + 24, 0, (w - 48) * 0.38, 5);
      // ◀◀  ❚❚  ▶▶ as shapes
      const cy = h / 2 - 34;
      ctx.beginPath();
      ctx.moveTo(-40, cy - 12); ctx.lineTo(-58, cy); ctx.lineTo(-40, cy + 12);
      ctx.moveTo(-56, cy - 12); ctx.lineTo(-74, cy); ctx.lineTo(-56, cy + 12);
      ctx.fill();
      ctx.fillRect(-9, cy - 13, 7, 26);
      ctx.fillRect(4, cy - 13, 7, 26);
      ctx.beginPath();
      ctx.moveTo(40, cy - 12); ctx.lineTo(58, cy); ctx.lineTo(40, cy + 12);
      ctx.moveTo(56, cy - 12); ctx.lineTo(74, cy); ctx.lineTo(56, cy + 12);
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

let counter = 0;
export function newSticker(kind: StickerKind, text?: string): Sticker {
  const def = STICKER_KINDS.find((k) => k.kind === kind) ?? STICKER_KINDS[0];
  counter += 1;
  // Spread new stickers so they don't stack exactly on top of each other.
  const offset = (counter % 5) * 0.04;
  return {
    id: `${kind}-${Date.now().toString(36)}-${counter}`,
    kind,
    x: 0.5 + offset - 0.08,
    y: 0.42 + offset,
    scale: 1,
    rotate: kind === "tape" ? -12 : kind === "note" ? 3 : 0,
    color: def.color,
    text,
  };
}
