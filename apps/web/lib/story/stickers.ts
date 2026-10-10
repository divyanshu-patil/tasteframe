// Paper elements & stickers, modelled on design-refs/pinterest/{stickers,scrapbook,notes,photodump}.
// All drawn as vectors (no copied artwork); deterministic, serializable, draggable in the editor.
import { type Ctx, fontString, rgba, rng, roundRect, star } from "./draw";
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
}

const BASE = 150; // px at scale 1

export function stickerBounds(s: Sticker): Rect {
  const r = (BASE * s.scale * (s.kind === "note" || s.kind === "player" || s.kind === "tape" ? 1.6 : 1)) / 2;
  return { x: s.x * W - r, y: s.y * H - r, w: r * 2, h: r * 2 };
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
export function drawSticker(ctx: Ctx, s: Sticker): void {
  const size = BASE * s.scale;
  ctx.save();
  ctx.translate(s.x * W, s.y * H);
  ctx.rotate((s.rotate * Math.PI) / 180);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
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
