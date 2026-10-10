"use client";

// Main-thread side of ml.worker.ts: MODNet person cutout, SlimSAM point selection, and a tiny
// progress store so the UI can show download bars. Everything returns null on failure, and
// callers keep the selfie-model / colour-based results instead.
import { useSyncExternalStore } from "react";
import type { Photo } from "./draw";
import type { Reply, Request, Task } from "./ml.worker";
import { maskCanvas } from "./segment";

export interface Progress { loaded: number; total: number; stage: "download" | "run" | "done" }

const progress: Record<Task, Progress | null> = { cutout: null, refine: null };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

/** Live download/run progress of a model task (null before it starts). */
export function useModelProgress(task: Task): Progress | null {
  return useSyncExternalStore(
    (f) => (listeners.add(f), () => listeners.delete(f)),
    () => progress[task],
    () => null,
  );
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, (r: Reply) => void>();
type Body = Request extends infer R ? (R extends Request ? Omit<R, "id"> : never) : never;

function call(body: Body): Promise<Extract<Reply, { ok: true }>> {
  if (!worker) {
    worker = new Worker(new URL("./ml.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<Reply>) => {
      const r = e.data;
      if ("type" in r) {
        progress[r.task] = { loaded: r.loaded, total: r.total, stage: r.stage };
        return emit();
      }
      pending.get(r.id)?.(r);
      pending.delete(r.id);
    };
  }
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, (r) => ("ok" in r && r.ok ? resolve(r) : reject(new Error("ok" in r ? r.error : "model error"))));
    worker!.postMessage({ ...body, id });
  });
}

function pixels(photo: Photo, w: number, h: number): ImageData | null {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true });
  if (!g) return null;
  g.drawImage(photo, 0, 0, w, h);
  return g.getImageData(0, 0, w, h);
}

/** Alpha values → a canvas of that size (white, with the values as alpha). */
function alphaCanvas(a: Float32Array, w: number, h: number, map = (v: number) => v): HTMLCanvasElement | null {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (!g) return null;
  const img = g.createImageData(w, h);
  for (let i = 0; i < a.length; i++) img.data[i * 4 + 3] = Math.round(Math.max(0, Math.min(1, map(a[i]!))) * 255);
  g.putImageData(img, 0, 0);
  return c;
}

const cutouts = new WeakMap<object, Promise<HTMLCanvasElement | null>>();
/**
 * MODNet person matte for `photo` at mask size (same as personMask), or null if it fails or
 * finds nobody. Cached per photo.
 */
export function modnetMask(photo: Photo): Promise<HTMLCanvasElement | null> {
  let p = cutouts.get(photo);
  if (!p) {
    p = (async () => {
      // MODNet: shortest side 512, both sides multiples of 32.
      const k = 512 / Math.min(photo.width, photo.height);
      const w = Math.max(32, Math.round((photo.width * k) / 32) * 32);
      const h = Math.max(32, Math.round((photo.height * k) / 32) * 32);
      const img = pixels(photo, w, h);
      if (!img) return null;
      const r = await call({ type: "cutout", image: img });
      let sum = 0;
      for (const v of r.data) sum += v;
      if (sum / r.data.length < 0.01) return null;
      const matte = alphaCanvas(r.data, r.width, r.height);
      const out = maskCanvas(photo);
      const g = out.getContext("2d");
      if (!matte || !g) return null;
      g.imageSmoothingQuality = "high";
      g.drawImage(matte, 0, 0, out.width, out.height);
      return out;
    })().catch((e: unknown) => {
      console.warn("Fine cutout unavailable:", e instanceof Error ? e.message : e);
      cutouts.delete(photo);
      return null;
    });
    cutouts.set(photo, p);
  }
  return p;
}

const keys = new WeakMap<object, string>();
let keyN = 0;
const keyOf = (photo: Photo) => keys.get(photo) ?? (keys.set(photo, `p${++keyN}`), keys.get(photo)!);
const sizeFor = (photo: Photo) => {
  const k = 1024 / Math.max(photo.width, photo.height);
  return { w: Math.max(1, Math.round(photo.width * k)), h: Math.max(1, Math.round(photo.height * k)) };
};

/** Download SlimSAM (first time) and read the photo once; true when selections can run. */
export async function prepareSelect(photo: Photo): Promise<boolean> {
  const { w, h } = sizeFor(photo);
  const img = pixels(photo, w, h);
  if (!img) return false;
  try {
    await call({ type: "encode", key: keyOf(photo), image: img });
    return true;
  } catch (e) {
    console.warn("Smart select model unavailable:", e instanceof Error ? e.message : e);
    return false;
  }
}

/**
 * What the points mark in `photo` (x, y in 0..1; label 1 = this, 0 = not this), as a soft
 * alpha canvas covering the whole photo (low resolution; scale it up). Needs prepareSelect.
 */
export async function selectAt(photo: Photo, points: { x: number; y: number; label: 0 | 1 }[]): Promise<HTMLCanvasElement | null> {
  if (!points.length) return null;
  const { w, h } = sizeFor(photo);
  try {
    const r = await call({ type: "decode", key: keyOf(photo), points: points.map((p) => [p.x * w, p.y * h]), labels: points.map((p) => p.label) });
    return alphaCanvas(r.data, r.width, r.height, (v) => 1 / (1 + Math.exp(-v)));
  } catch {
    return null;
  }
}
