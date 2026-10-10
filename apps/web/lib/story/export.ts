// PNG export at exactly 1080×1920 — independent of on-screen preview size.
import type { Photo } from "./draw";
import { TEMPLATES, renderStory } from "./templates";
import type { StoryState } from "./types";
import { STORY_H, STORY_W } from "./types";

const FONT_ROLES = ["display", "serif", "italic", "sans", "hand", "mono"] as const;

/** Wait until every story font is loaded so the export never falls back mid-render. */
export async function fontsReady(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  const { fontString } = await import("./draw");
  await Promise.all(FONT_ROLES.map((r) => document.fonts.load(fontString(r, 48)).catch(() => [])));
  await document.fonts.ready;
}

export function exportFilename(s: StoryState, now = new Date()): string {
  const day = now.toISOString().slice(0, 10);
  return `tasteframe-${s.templateId}-${day}.png`;
}

export async function exportPng(photo: Photo, s: StoryState): Promise<Blob> {
  if (!TEMPLATES[s.templateId]) throw new Error("Unknown template");
  await fontsReady();
  const canvas = document.createElement("canvas");
  canvas.width = STORY_W;
  canvas.height = STORY_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");
  renderStory(ctx, photo, s);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Export failed."))), "image/png"),
  );
}
