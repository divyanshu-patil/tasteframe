// Serializable story model. Rendering is a pure function of (photo, StoryState).
import type { FilterId } from "./filters";
import type { Sticker } from "./stickers";

export const STORY_W = 1080;
export const STORY_H = 1920;
/** Instagram overlays its UI roughly over the top 250px and bottom 340px; keep text out of it. */
export const SAFE = { top: 250 / STORY_H, bottom: 1 - 340 / STORY_H, side: 64 / STORY_W };

export const TEMPLATE_IDS = [
  "cinematic",
  "stills",
  "editorial",
  "journal",
  "scrapbook",
  "filmstrip",
  "vintage",
  "minimal",
  "photodump",
  "magazine",
  "nowplaying",
  "vinyl",
  "moodboard",
  "ticket",
  "y2k",
  "torn",
  "note",
  "newspaper",
  "softfocus",
] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export type FontRole = "display" | "serif" | "sans" | "hand" | "mono" | "italic";
export type Align = "left" | "center" | "right";

export interface TextLayer {
  text: string;
  size: number; // px at 1080×1920
  color: string;
  align: Align;
  x: number; // 0..1 anchor (left/center/right edge depending on align)
  y: number; // 0..1 top of the text block
  width: number; // 0..1 max line width
  font: FontRole;
}

export interface StoryState {
  templateId: TemplateId;
  filter: FilterId;
  stickers: Sticker[];
  headline: TextLayer;
  caption: TextLayer;
  /** zoom ≥ 1; x,y = cover alignment 0..1; fit "contain" shows the whole photo. */
  crop: { zoom: number; x: number; y: number; fit: "cover" | "contain" };
  overlay: { strength: number; color: string };
  decorations: Record<string, boolean>;
  accent: string;
  palette: string[];
  stamp: string; // date/edge text, deterministic per story
}

export interface TemplateInput {
  headline: string;
  caption: string;
  accent: string;
  palette: string[];
  date: Date;
  /** Main subject position (0..1) from image reasoning: default crop focus + text placement. */
  focus?: { x: number; y: number };
  /** Suggested photo filter for this layout (from the API's mood rules). */
  filter?: FilterId;
  /** Recommended music, for the Now Playing / Vinyl layouts. */
  music?: { title: string | null; artist: string | null };
  /** Scene cues from image reasoning (Mood Board tags). */
  scene?: string[];
}

export type TextKey = "headline" | "caption";
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
