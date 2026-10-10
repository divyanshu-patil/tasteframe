// Serializable story model. Rendering is a pure function of (photo, StoryState).
import type { CoverState } from "./cover";
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
  "duo",
  "splitscreen",
  "booth",
  "torncollage",
  "grid",
  "mosaic",
  "polaroids",
  // From the owner's reference set (templates-refs.ts).
  "playlist",
  "covermouth",
  "camtilt",
  "playercut",
  "triptych",
  "cctv",
  "colorbox",
  "tornstrip",
  "cutout",
  "focus",
  "viewfinder",
  "camcorder",
  "sepiabooth",
  "desktop",
  "chat",
  "kissmark",
  "xerox",
  "yearbook",
  "coversepia",
  "covercorner",
  // Declarative aesthetic + song-cover layouts (layouts-aesthetic.ts).
  "weekday",
  "daysplit",
  "halfword",
  "verticalday",
  "scripttitle",
  "refresh",
  "bigletters",
  "navheader",
  "quotemarks",
  "spotlight",
  "bluehour",
  "subtitlebar",
  "redblock",
  "badge",
  "stats",
  "notesapp",
  "handnote",
  "sticky",
  "checklist",
  "calendarcard",
  "receipt",
  "doodlesun",
  "bigpolaroid",
  "framein",
  "postcard",
  "stackedcards",
  "bwstack",
  "wavecut",
  "diagonal",
  "filmburn",
  "hearts",
  "coverface",
  "coversingle",
  "coverfloat",
  "coverbubble",
  "coverpolaroid",
  "notesdark",
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

export interface Crop {
  zoom: number;
  x: number;
  y: number;
  fit: "cover" | "contain";
  /** Clockwise quarter turns of the source photo (0/90/180/270). */
  rot?: 0 | 90 | 180 | 270;
}

export interface StoryState {
  templateId: TemplateId;
  filter: FilterId;
  stickers: Sticker[];
  headline: TextLayer;
  caption: TextLayer;
  /** Slot 1's crop. zoom ≥ 1; x,y = cover alignment 0..1; fit "contain" shows the whole photo. */
  crop: Crop;
  /** Multi-photo: photo index shown in each slot (drag to swap), and crops for slots 2–4. */
  order: number[];
  crops: Crop[];
  overlay: { strength: number; color: string };
  decorations: Record<string, boolean>;
  accent: string;
  palette: string[];
  stamp: string; // date/edge text, deterministic per story
  /** Square song cover (album art) placed on the Story. */
  cover?: CoverState;
  /** Main subject point in photo 1 (0..1 of the photo), for face-anchored decorations. */
  focus?: { x: number; y: number };
  /** Draggable window (0..1 of the Story), e.g. the colour box over a B&W photo. */
  spot?: Rect;
  /** Die-cut outline around a person cutout. */
  outline?: { show: boolean; color: string; width: number; margin?: number };
  /** Real tracks (Apple Music catalogue) shown in the playlist panel sticker. */
  tracks?: { title: string; artist: string; explicit?: boolean; trackId?: number }[];
  /** Per-box framing tweaks (drag/zoom inside a box that shows part of the photo), keyed by
   *  box id ("slot2" for repeated slots, or a layout's named inset). Offsets add to the default. */
  views?: Record<string, { dx: number; dy: number; zoom: number }>;
  /** Moved/resized layout boxes (0..1 of the Story), keyed by the layout's box id. */
  boxes?: Record<string, Rect>;
  /** Prop photo id (public/props) shown where a layout offers one, e.g. Playlist's lower window. */
  prop?: string;
  /** Short words from the photo (image reasoning elements) for checklist/receipt layouts. */
  tags?: string[];
}

export interface TemplateInput {
  headline: string;
  caption: string;
  accent: string;
  palette: string[];
  date: Date;
  /** Main subject position (0..1) from image reasoning: default crop focus + text placement. */
  focus?: { x: number; y: number };
  /** Per-photo subject positions (multi-photo Stories). */
  focuses?: { x: number; y: number }[];
  /** Suggested photo filter for this layout (from the API's mood rules). */
  filter?: FilterId;
  /** Recommended music, for the Now Playing / Vinyl layouts. */
  music?: { title: string | null; artist: string | null; trackId?: number | null };
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
