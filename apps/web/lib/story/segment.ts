// Person segmentation in the browser (MediaPipe selfie segmenter, Apache-2.0). Runs on the
// user's device — free, no server load, the photo isn't sent anywhere for this. The model is
// vendored in public/models; the wasm runtime loads (pinned) on first use only.
import type { Photo } from "./draw";

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MODEL = "/models/selfie_segmenter.tflite";
const MAX_SIDE = 640;

type Segmenter = import("@mediapipe/tasks-vision").ImageSegmenter;
let segmenter: Promise<Segmenter | null> | null = null;
const masks = new WeakMap<object, Promise<HTMLCanvasElement | null>>();

/**
 * MediaPipe's wasm prints informational lines ("INFO: Created TensorFlow Lite XNNPACK delegate…")
 * through console.error, which dev tools flag as errors. While it runs, route those INFO lines
 * to console.info; anything else still reaches console.error untouched.
 */
async function quietInfo<T>(fn: () => Promise<T> | T): Promise<T> {
  const original = console.error;
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string" && /^INFO: /.test(args[0])) console.info(...args);
    else original(...args);
  };
  try {
    return await fn();
  } finally {
    console.error = original;
  }
}

function load(): Promise<Segmenter | null> {
  segmenter ??= (async () => {
    try {
      const { FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
      const files = await FilesetResolver.forVisionTasks(WASM);
      return await quietInfo(() => ImageSegmenter.createFromOptions(files, {
        baseOptions: { modelAssetPath: MODEL },
        runningMode: "IMAGE",
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      }));
    } catch (e) {
      console.warn("Person segmentation unavailable:", e instanceof Error ? e.message : e);
      segmenter = null; // let a later attempt retry
      return null;
    }
  })();
  return segmenter;
}

/** An empty canvas the size of `photo`'s mask (same aspect ratio, ≤640px). */
export function maskCanvas(photo: Photo): HTMLCanvasElement {
  const k = Math.min(1, MAX_SIDE / Math.max(photo.width, photo.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(photo.width * k));
  c.height = Math.max(1, Math.round(photo.height * k));
  return c;
}

/**
 * Alpha mask of the person in `photo` (same aspect ratio, ≤640px), or null when segmentation
 * is unavailable. Cached per photo.
 */
export function personMask(photo: Photo): Promise<HTMLCanvasElement | null> {
  let p = masks.get(photo);
  if (!p) {
    p = (async () => {
      const seg = await load();
      if (!seg) return null;
      const src = maskCanvas(photo);
      src.getContext("2d")?.drawImage(photo, 0, 0, src.width, src.height);
      const res = await quietInfo(() => seg.segment(src));
      const conf = res.confidenceMasks?.[0]?.getAsFloat32Array();
      res.close();
      if (!conf) return null;
      const out = maskCanvas(photo);
      const ctx = out.getContext("2d");
      if (!ctx) return null;
      const img = ctx.createImageData(out.width, out.height);
      let fg = 0;
      for (let i = 0; i < conf.length; i++) {
        // Soft edge: ramp confidence 0.35..0.65 → alpha 0..255.
        const a = Math.max(0, Math.min(1, (conf[i]! - 0.35) / 0.3));
        img.data[i * 4 + 3] = Math.round(a * 255);
        fg += a;
      }
      if (fg / conf.length < 0.01) return null; // nobody in the photo
      ctx.putImageData(img, 0, 0);
      return out;
    })();
    masks.set(photo, p);
  }
  return p;
}

