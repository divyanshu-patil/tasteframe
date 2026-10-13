// PNG export at exactly 1080×1920 — independent of on-screen preview size.
import { elementsReady, propReady } from "./elements";
import { type Photo, fontString } from "./draw";
import { TEMPLATES, type StoryAssets, renderStory } from "./templates";
import type { StoryState } from "./types";
import { STORY_H, STORY_W } from "./types";

const FONT_ROLES = ["display", "serif", "italic", "sans", "hand", "mono"] as const;

/** Wait until every story font is loaded so the export never falls back mid-render. */
let fontsPromise: Promise<void> | null = null;
export function fontsReady(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return Promise.resolve();
  fontsPromise ??= Promise.all(
    FONT_ROLES.map((r) => document.fonts.load(fontString(r, 48)).catch(() => [])),
  ).then(() => document.fonts.ready.then(() => undefined));
  return fontsPromise;
}

export function exportFilename(s: StoryState, now = new Date()): string {
  const day = now.toISOString().slice(0, 10);
  return `tasteframe-${s.templateId}-${day}.png`;
}

/** The finished Story at 1080×1920 on its own canvas. */
async function renderCanvas(photo: Photo | Photo[], s: StoryState, assets: StoryAssets): Promise<HTMLCanvasElement> {
  if (!TEMPLATES[s.templateId]) throw new Error("Unknown template");
  await Promise.all([fontsReady(), elementsReady(), ...(TEMPLATES[s.templateId].prop ? [propReady(s.prop ?? TEMPLATES[s.templateId].prop!)] : [])]);
  const canvas = document.createElement("canvas");
  canvas.width = STORY_W;
  canvas.height = STORY_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");
  renderStory(ctx, photo, s, assets);
  return canvas;
}

export async function exportPng(photo: Photo | Photo[], s: StoryState, assets: StoryAssets = {}): Promise<Blob> {
  const canvas = await renderCanvas(photo, s, assets);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Export failed."))), "image/png"),
  );
}

/** Best recordable container: MP4 (what Instagram accepts) where supported, else WebM. */
export function videoType(): string | null {
  if (typeof MediaRecorder === "undefined" || typeof HTMLCanvasElement === "undefined") return null;
  return (
    ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"].find((t) =>
      MediaRecorder.isTypeSupported(t),
    ) ?? null
  );
}

/**
 * The Story as a 1080×1920 video with the user's own audio file as the soundtrack. Records in
 * real time (a 15 s clip takes ~15 s) with a slow push-in so it isn't a frozen frame.
 */
export async function exportVideo(
  photo: Photo | Photo[],
  s: StoryState,
  assets: StoryAssets,
  audio: Blob,
  seconds = 15,
): Promise<{ blob: Blob; ext: "mp4" | "webm" }> {
  const type = videoType();
  if (!type) throw new Error("Video export isn't supported in this browser.");
  const still = await renderCanvas(photo, s, assets);
  const canvas = document.createElement("canvas");
  canvas.width = STORY_W;
  canvas.height = STORY_H;
  const ctx = canvas.getContext("2d")!;
  const draw = (p: number) => {
    const z = 1 + 0.04 * p;
    ctx.drawImage(still, (STORY_W * (1 - z)) / 2, (STORY_H * (1 - z)) / 2, STORY_W * z, STORY_H * z);
  };
  const url = URL.createObjectURL(audio);
  const el = new Audio(url);
  const ac = new AudioContext();
  try {
    await new Promise((resolve, reject) => {
      el.oncanplaythrough = resolve;
      el.onerror = () => reject(new Error("That audio file couldn't be played."));
      el.load();
    });
    const duration = Math.min(seconds, Number.isFinite(el.duration) && el.duration > 0 ? el.duration : seconds);
    // Route the audio into the recording only (not the speakers).
    const dest = ac.createMediaStreamDestination();
    ac.createMediaElementSource(el).connect(dest);
    const stream = canvas.captureStream(30);
    for (const t of dest.stream.getAudioTracks()) stream.addTrack(t);
    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8_000_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const stopped = new Promise<void>((r) => (rec.onstop = () => r()));
    draw(0);
    rec.start(1000);
    await el.play();
    const start = performance.now();
    // setInterval, not rAF: keeps frames coming if the tab is briefly hidden.
    await new Promise<void>((resolve) => {
      const id = setInterval(() => {
        const t = (performance.now() - start) / 1000;
        draw(Math.min(1, t / duration));
        if (t >= duration || el.ended) {
          clearInterval(id);
          resolve();
        }
      }, 1000 / 30);
    });
    el.pause();
    rec.stop();
    await stopped;
    return { blob: new Blob(chunks, { type: type.split(";")[0] }), ext: type.startsWith("video/mp4") ? "mp4" : "webm" };
  } finally {
    el.pause();
    void ac.close();
    URL.revokeObjectURL(url);
  }
}
