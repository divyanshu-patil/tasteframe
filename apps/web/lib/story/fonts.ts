// Google Fonts for text layers. A layer's `family` overrides its layout's typeface; without one
// the layout's own font (its role) is used. Fonts load on demand from Google Fonts and canvases
// redraw when they arrive (onAssetLoaded). Rendering stays pure: same state → same pixels once loaded.
import { assetLoaded } from "./elements";
import type { FontRole } from "./types";

/** The layout fonts behind each role (app/layout.tsx), shown as "this layout's" choices. */
export const ROLE_FONTS: Record<FontRole, string> = {
  display: "Bodoni Moda",
  serif: "Source Serif 4",
  italic: "Instrument Serif",
  sans: "Archivo",
  hand: "Caveat",
  mono: "Space Mono",
};

/** Curated Google Fonts with the weights they really ship (so every request is valid). */
export const GOOGLE_FONTS: { family: string; group: string; bold?: boolean }[] = [
  ...["Inter", "Poppins", "Montserrat", "DM Sans", "Space Grotesk", "Syne", "Josefin Sans", "Rubik", "Unbounded", "Oswald"].map((family) => ({ family, group: "Sans", bold: true })),
  ...["Bebas Neue", "Anton", "Archivo Black", "Righteous", "Bungee", "Monoton", "Rubik Mono One"].map((family) => ({ family, group: "Display" })),
  ...["Playfair Display", "Cormorant Garamond", "Libre Baskerville", "Fraunces", "Lora"].map((family) => ({ family, group: "Serif", bold: true })),
  ...["DM Serif Display", "Abril Fatface", "Prata", "Italiana"].map((family) => ({ family, group: "Serif" })),
  { family: "Dancing Script", group: "Script & hand", bold: true },
  ...["Pacifico", "Great Vibes", "Satisfy", "Lobster", "Homemade Apple", "Shadows Into Light", "Permanent Marker", "Gloria Hallelujah", "Indie Flower", "Reenie Beanie", "Rock Salt"].map((family) => ({ family, group: "Script & hand" })),
  ...["Courier Prime", "IBM Plex Mono"].map((family) => ({ family, group: "Mono & pixel", bold: true })),
  ...["VT323", "Press Start 2P"].map((family) => ({ family, group: "Mono & pixel" })),
];

export const FAMILY_RE = /^[A-Za-z0-9 ]{2,40}$/;
const state = new Map<string, "loading" | "ready" | "failed">();

/** Weights per family: the curated list, plus the full catalogue once loaded (search). */
export interface FontSpec {
  family: string;
  category: string;
  regular: number;
  bold: boolean;
}
const specs = new Map<string, FontSpec>(GOOGLE_FONTS.map((f) => [f.family, { family: f.family, category: f.group, regular: 400, bold: Boolean(f.bold) }]));
const CATEGORY: Record<string, string> = { s: "Sans", e: "Serif", d: "Display", h: "Handwriting", m: "Mono" };
let catalogue: Promise<FontSpec[]> | null = null;

/** Every Google Font (google-fonts.json: family, category, regular weight, has bold), most
 *  popular first. Fetched as its own chunk the first time someone searches. */
export function loadCatalogue(): Promise<FontSpec[]> {
  catalogue ??= import("./google-fonts.json").then((m) =>
    (m.default as [string, string, number, number][]).map(([family, c, regular, bold]) => {
      const spec = specs.get(family) ?? { family, category: CATEGORY[c] ?? "Sans", regular, bold: bold === 1 };
      specs.set(family, spec);
      return spec;
    }),
  );
  return catalogue;
}

/** Families matching a search: names starting with it first, then containing it. */
export function searchFonts(all: FontSpec[], query: string, limit = 40): FontSpec[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const starts = all.filter((f) => f.family.toLowerCase().startsWith(q));
  const contains = all.filter((f) => !f.family.toLowerCase().startsWith(q) && f.family.toLowerCase().includes(q));
  return [...starts, ...contains].slice(0, limit);
}

/** Start loading a Google Font (no-op outside the browser, or once requested). */
export function ensureFont(family: string): void {
  if (typeof document === "undefined" || state.has(family) || !FAMILY_RE.test(family)) return;
  state.set(family, "loading");
  const known = specs.get(family);
  const name = family.trim().replace(/ /g, "+");
  const link = document.createElement("link");
  link.rel = "stylesheet";
  // Ask only for weights the family has (from the catalogue), so the request is always valid.
  const regular = known?.regular ?? 400;
  const weights = known?.bold && regular !== 700 ? `:wght@${regular};700` : regular !== 400 ? `:wght@${regular}` : "";
  link.href = `https://fonts.googleapis.com/css2?family=${name}${weights}&display=swap`;
  link.onload = () =>
    void Promise.all([document.fonts.load(`${regular} 48px "${family}"`), known?.bold ? document.fonts.load(`700 48px "${family}"`) : null])
      .then((faces) => {
        state.set(family, faces[0]?.length ? "ready" : "failed");
        assetLoaded();
      })
      .catch(() => state.set(family, "failed"));
  link.onerror = () => state.set(family, "failed");
  document.head.appendChild(link);
}

/** False once we know Google Fonts has no such family (typed-in names). */
export const fontFailed = (family: string) => state.get(family) === "failed";

/** CSS font for a layer: its Google Font (with the layout font as fallback) or the layout font. */
export function familyFont(family: string, role: FontRole, size: number, fallback: string): string {
  ensureFont(family);
  const spec = specs.get(family);
  const weight = (role === "sans" || role === "display") && spec?.bold ? 700 : (spec?.regular ?? 400);
  const style = role === "italic" ? "italic " : "";
  return `${style}${weight} ${Math.round(size)}px "${family}", ${fallback}`;
}
