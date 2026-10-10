// Pinterest references behind each layout (design-refs/build_pins.py → pins.json): links,
// credits and Pinterest's own oEmbed thumbnail URL only — no images are stored or served.
import data from "./pins.json";
import type { TemplateId } from "./types";

export interface Pin {
  pin: string;
  category: string;
  author: string;
  authorUrl: string;
  thumb: string;
  w: number;
  h: number;
  layouts: string[];
}

export const PINS = data as Pin[];
export const pinUrl = (p: Pin) => `https://www.pinterest.com/pin/${p.pin}/`;
/** Pins that inspired a layout, the owner's own references first. */
export const pinsFor = (id: TemplateId): Pin[] =>
  PINS.filter((p) => p.layouts.includes(id)).sort((a, b) => Number(b.category === "owner") - Number(a.category === "owner"));
