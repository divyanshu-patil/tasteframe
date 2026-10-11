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

/** Start loading a Google Font (no-op outside the browser, or once requested). */
export function ensureFont(family: string): void {
  if (typeof document === "undefined" || state.has(family) || !FAMILY_RE.test(family)) return;
  state.set(family, "loading");
  const known = GOOGLE_FONTS.find((f) => f.family === family);
  const name = family.trim().replace(/ /g, "+");
  const link = document.createElement("link");
  link.rel = "stylesheet";
  // Typed-in fonts ask for the regular weight only: always valid when the family exists.
  link.href = `https://fonts.googleapis.com/css2?family=${name}${known?.bold ? ":wght@400;700" : ""}&display=swap`;
  link.onload = () =>
    void Promise.all([document.fonts.load(`400 48px "${family}"`), known?.bold ? document.fonts.load(`700 48px "${family}"`) : null])
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
  const weight = role === "sans" || role === "display" ? (GOOGLE_FONTS.find((f) => f.family === family)?.bold ? "700" : "400") : "400";
  const style = role === "italic" ? "italic " : "";
  return `${style}${weight} ${Math.round(size)}px "${family}", ${fallback}`;
}
