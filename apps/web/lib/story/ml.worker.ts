// Runs the small ONNX models off the main thread, so the editor never freezes:
//   MODNet (portrait matting, Apache-2.0, 6.3 MB): a finer person cutout than the selfie model.
//   SlimSAM-77 (Apache-2.0, 8.5 + 4.7 MB): "this thing" from points, for smart refine.
// Files download once with progress and are kept in Cache Storage; ONNX Runtime's plain WASM
// build (~3 MB compressed) comes from jsDelivr, pinned like the MediaPipe runtime.
import * as ort from "onnxruntime-web/wasm";

const ORT = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/";
const HF = "https://huggingface.co";
const FILES = {
  wasm: { url: `${ORT}ort-wasm-simd-threaded.wasm`, bytes: 14239897 },
  modnet: { url: `${HF}/Xenova/modnet/resolve/fa2fa546052fba4c08921230a26cc69a333fca12/onnx/model_quantized.onnx`, bytes: 6632188 },
  samEncoder: { url: `${HF}/Xenova/slimsam-77-uniform/resolve/5850ab45f587c112167512ffef949107115e26a0/onnx/vision_encoder_quantized.onnx`, bytes: 8882165 },
  samDecoder: { url: `${HF}/Xenova/slimsam-77-uniform/resolve/5850ab45f587c112167512ffef949107115e26a0/onnx/prompt_encoder_mask_decoder_quantized.onnx`, bytes: 4903810 },
} as const;
type FileKey = keyof typeof FILES;
export type Task = "cutout" | "refine";

export type Request =
  | { id: number; type: "cutout"; image: ImageData }
  | { id: number; type: "encode"; key: string; image: ImageData }
  | { id: number; type: "decode"; key: string; points: [number, number][]; labels: number[] };
export type Reply =
  | { id: number; ok: true; data: Float32Array; width: number; height: number }
  | { id: number; ok: false; error: string }
  | { type: "progress"; task: Task; loaded: number; total: number; stage: "download" | "run" | "done" };

const scope = self as unknown as { postMessage(m: Reply, transfer: Transferable[]): void; onmessage: ((e: MessageEvent<Request>) => void) | null };
const post = (m: Reply, transfer: Transferable[] = []) => scope.postMessage(m, transfer);

const bytes = new Map<FileKey, Promise<Uint8Array>>();
/** Download files for a task, reporting combined progress; cached across visits. */
function fetchAll(task: Task, keys: FileKey[]): Promise<Uint8Array[]> {
  const total = keys.reduce((s, k) => s + FILES[k].bytes, 0);
  const done = new Map<FileKey, number>();
  const report = () => post({ type: "progress", task, loaded: [...done.values()].reduce((a, b) => a + b, 0), total, stage: "download" });
  return Promise.all(keys.map((k) => {
    let p = bytes.get(k);
    if (!p) {
      p = (async () => {
        const { url, bytes: size } = FILES[k];
        const cache = await caches.open("tasteframe-models-v1").catch(() => null);
        const hit = await cache?.match(url);
        if (hit) return new Uint8Array(await hit.arrayBuffer());
        const res = await fetch(url);
        if (!res.ok || !res.body) throw new Error(`model download failed (${res.status})`);
        const parts: Uint8Array[] = [];
        let got = 0;
        for (const reader = res.body.getReader(); ;) {
          const { done: end, value } = await reader.read();
          if (end) break;
          parts.push(value);
          got += value.length;
          done.set(k, Math.min(got, size));
          report();
        }
        const buf = new Uint8Array(got);
        let o = 0;
        for (const part of parts) { buf.set(part, o); o += part.length; }
        await cache?.put(url, new Response(buf)).catch(() => undefined);
        return buf;
      })();
      p.catch(() => bytes.delete(k)); // let a later attempt retry
      bytes.set(k, p);
    }
    return p.then((b) => { done.set(k, FILES[k].bytes); report(); return b; });
  }));
}

let runtime: Promise<void> | null = null;
function ready(task: Task, models: FileKey[]): Promise<Uint8Array[]> {
  runtime ??= fetchAll(task, ["wasm"]).then(([wasm]) => {
    ort.env.wasm.wasmBinary = wasm!;
    ort.env.wasm.wasmPaths = ORT;
    ort.env.wasm.numThreads = 1; // threads need cross-origin isolation, which the app doesn't use
  });
  return Promise.all([runtime, fetchAll(task, ["wasm", ...models])]).then(([, b]) => b.slice(1));
}

const sessions = new Map<FileKey, Promise<ort.InferenceSession>>();
function session(task: Task, k: FileKey) {
  let s = sessions.get(k);
  if (!s) {
    const have = bytes.get(k);
    // Already downloaded (e.g. by a combined fetch): don't report progress again.
    s = (have && runtime ? Promise.all([runtime, have]).then(([, b]) => b) : ready(task, [k]).then(([b]) => b!))
      .then((b) => ort.InferenceSession.create(b, { executionProviders: ["wasm"] }));
    s.catch(() => sessions.delete(k));
    sessions.set(k, s);
  }
  return s;
}

/** CHW float tensor from RGBA pixels, normalised per channel. */
function chw(img: ImageData, mean: number[], std: number[], padTo?: number): ort.Tensor {
  const { width: w, height: h, data } = img;
  const W = padTo ?? w, H = padTo ?? h;
  const out = new Float32Array(3 * W * H);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, o = y * W + x;
      for (let c = 0; c < 3; c++) out[c * W * H + o] = (data[i + c]! / 255 - mean[c]!) / std[c]!;
    }
  return new ort.Tensor("float32", out, [1, 3, H, W]);
}

// SlimSAM image embeddings for the photo being refined (one at a time).
let encoded: { key: string; feeds: Record<string, ort.Tensor>; w: number; h: number } | null = null;

async function handle(m: Request): Promise<Reply> {
  if (m.type === "cutout") {
    const s = await session("cutout", "modnet");
    post({ type: "progress", task: "cutout", loaded: 1, total: 1, stage: "run" });
    const out = await s.run({ input: chw(m.image, [0.5, 0.5, 0.5], [0.5, 0.5, 0.5]) });
    const t = out.output!;
    post({ type: "progress", task: "cutout", loaded: 1, total: 1, stage: "done" });
    return { id: m.id, ok: true, data: t.data as Float32Array, width: t.dims[3]!, height: t.dims[2]! };
  }
  if (m.type === "encode") {
    await ready("refine", ["samEncoder", "samDecoder"]); // one combined progress bar
    const [enc] = await Promise.all([session("refine", "samEncoder"), session("refine", "samDecoder")]);
    post({ type: "progress", task: "refine", loaded: 1, total: 1, stage: "run" });
    if (encoded?.key !== m.key) {
      // The image arrives already resized to 1024 on its long side; pad to 1024×1024.
      const out = await enc.run({ pixel_values: chw(m.image, [0.485, 0.456, 0.406], [0.229, 0.224, 0.225], 1024) });
      encoded = { key: m.key, feeds: { image_embeddings: out.image_embeddings!, image_positional_embeddings: out.image_positional_embeddings! }, w: m.image.width, h: m.image.height };
    }
    post({ type: "progress", task: "refine", loaded: 1, total: 1, stage: "done" });
    return { id: m.id, ok: true, data: new Float32Array(0), width: 0, height: 0 };
  }
  // decode: points are in the encoded image's pixels (≤1024).
  if (!encoded || encoded.key !== m.key) throw new Error("photo not prepared");
  const dec = await session("refine", "samDecoder");
  const n = m.points.length;
  const out = await dec.run({
    ...encoded.feeds,
    input_points: new ort.Tensor("float32", Float32Array.from(m.points.flat()), [1, 1, n, 2]),
    input_labels: new ort.Tensor("int64", BigInt64Array.from(m.labels.map(BigInt)), [1, 1, n]),
  });
  const iou = out.iou_scores!.data as Float32Array;
  const all = out.pred_masks!.data as Float32Array; // [1,1,3,256,256] logits over the padded 1024 frame
  const cw = Math.ceil(encoded.w / 4), ch = Math.ceil(encoded.h / 4);
  // SAM offers three nested guesses (part / object / whole). A stroke over a handbag means the
  // handbag, not the person holding it: take the smallest confident guess that still covers
  // most of the "this" points.
  const at = (k: number, x: number, y: number) => all[k * 65536 + Math.min(255, Math.floor(y / 4)) * 256 + Math.min(255, Math.floor(x / 4))]!;
  const yes = m.points.filter((_, i) => m.labels[i] === 1);
  const best = Math.max(...iou);
  const guesses = [0, 1, 2].map((k) => {
    let area = 0;
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) if (all[k * 65536 + y * 256 + x]! > 0) area++;
    const hit = yes.filter(([x, y]) => at(k, x, y) > 0).length / Math.max(1, yes.length);
    return { k, area, hit, score: iou[k]! };
  });
  const fits = guesses.filter((g) => g.area > 0 && g.hit >= 0.7 && g.score >= best - 0.15).sort((a, b) => a.area - b.area);
  const pick = (fits[0] ?? guesses.sort((a, b) => b.score - a.score)[0]!).k;
  const crop = new Float32Array(cw * ch);
  for (let y = 0; y < ch; y++) crop.set(all.subarray(pick * 65536 + y * 256, pick * 65536 + y * 256 + cw), y * cw);
  return { id: m.id, ok: true, data: crop, width: cw, height: ch };
}

scope.onmessage = (e: MessageEvent<Request>) => {
  handle(e.data)
    .then((r) => post(r, "data" in r ? [r.data.buffer] : []))
    .catch((err: unknown) => post({ id: e.data.id, ok: false, error: err instanceof Error ? err.message : String(err) }));
};
