// Stroke-guided "smart select" with no model download: turns rough strokes into an object
// selection that follows the photo's colours and edges.
//   - Scribbles: grow from the stroke through similar colours, stopping at strong edges
//     (geodesic region growing); strokes of the other kind act as walls.
//   - Loops (lasso): "the thing inside": colour models for inside vs. just outside the loop,
//     a few GrabCut-style refinements, keep the solid parts.
// Finally a guided filter snaps the hard selection to the photo's edges (soft where they are).
// Pure: pixels in, alpha out; runs in a few ms at ≤320px.

export interface Pixels { data: Uint8ClampedArray; width: number; height: number } // RGBA
export interface Guide { tool: "add" | "erase"; loop: boolean; pts: { x: number; y: number }[] } // 0..1

type Lab = Float32Array; // 3 per pixel

function toLab({ data, width, height }: Pixels): Lab {
  const n = width * height;
  const out = new Float32Array(n * 3);
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  for (let i = 0; i < n; i++) {
    const r = lin(data[i * 4]! / 255), g = lin(data[i * 4 + 1]! / 255), b = lin(data[i * 4 + 2]! / 255);
    const x = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047);
    const y = f(r * 0.2126 + g * 0.7152 + b * 0.0722);
    const z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
    out[i * 3] = 116 * y - 16;
    out[i * 3 + 1] = 500 * (x - y);
    out[i * 3 + 2] = 200 * (y - z);
  }
  return out;
}

const d2 = (lab: Lab, i: number, c: number[], k: number) => {
  const a = lab[i * 3]! - c[k * 3]!, b = lab[i * 3 + 1]! - c[k * 3 + 1]!, d = lab[i * 3 + 2]! - c[k * 3 + 2]!;
  return a * a + b * b + d * d;
};
function nearest(lab: Lab, i: number, c: number[]): number {
  let best = Infinity;
  for (let k = 0; k < c.length / 3; k++) best = Math.min(best, d2(lab, i, c, k));
  return Math.sqrt(best);
}

/**
 * k-means colour centres (flat [L,a,b,…]) of the given pixel indices. With `minShare`, colours
 * covering less than that share of the pixels are dropped (what a rough stroke only grazed).
 */
function centres(lab: Lab, idx: number[], k: number, minShare = 0): number[] {
  if (!idx.length) return [];
  const step = Math.max(1, Math.floor(idx.length / 3000));
  const s = idx.filter((_, j) => j % step === 0);
  k = Math.min(k, s.length);
  const c: number[] = [];
  for (let j = 0; j < k; j++) { const i = s[Math.floor(((j + 0.5) * s.length) / k)]!; c.push(lab[i * 3]!, lab[i * 3 + 1]!, lab[i * 3 + 2]!); }
  for (let it = 0; it < 6; it++) {
    const sum = new Float64Array(k * 4);
    for (const i of s) {
      let bk = 0, bd = Infinity;
      for (let q = 0; q < k; q++) { const d = d2(lab, i, c, q); if (d < bd) { bd = d; bk = q; } }
      for (let ch = 0; ch < 3; ch++) sum[bk * 4 + ch] = sum[bk * 4 + ch]! + lab[i * 3 + ch]!;
      sum[bk * 4 + 3] = sum[bk * 4 + 3]! + 1;
    }
    for (let q = 0; q < k; q++) if (sum[q * 4 + 3]) for (let ch = 0; ch < 3; ch++) c[q * 3 + ch] = sum[q * 4 + ch]! / sum[q * 4 + 3]!;
    if (it === 5 && minShare > 0) {
      const kept = c.filter((_, j) => sum[Math.floor(j / 3) * 4 + 3]! >= minShare * s.length);
      if (kept.length) return kept;
    }
  }
  return c;
}

/** Pixels covered by a polyline of the given radius (px). */
function rasterLine(pts: { x: number; y: number }[], W: number, H: number, r: number, into: Uint8Array) {
  const dot = (cx: number, cy: number) => {
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(H - 1, Math.ceil(cy + r)); y++)
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(W - 1, Math.ceil(cx + r)); x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) into[y * W + x] = 1;
  };
  pts.forEach((p, i) => {
    const a = pts[i - 1] ?? p;
    const steps = Math.max(1, Math.ceil(Math.hypot((p.x - a.x) * W, (p.y - a.y) * H) / Math.max(1, r / 2)));
    for (let t = 0; t <= steps; t++) dot((a.x + ((p.x - a.x) * t) / steps) * W, (a.y + ((p.y - a.y) * t) / steps) * H);
  });
}

/** Pixels inside a closed polygon (even-odd). */
function rasterPoly(pts: { x: number; y: number }[], W: number, H: number, into: Uint8Array) {
  const P = pts.map((p) => ({ x: p.x * W, y: p.y * H }));
  for (let y = 0; y < H; y++) {
    const xs: number[] = [];
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      const a = P[i]!, b = P[j]!;
      if ((a.y > y + 0.5) !== (b.y > y + 0.5)) xs.push(a.x + ((y + 0.5 - a.y) * (b.x - a.x)) / (b.y - a.y));
    }
    xs.sort((m, n) => m - n);
    for (let k = 0; k + 1 < xs.length; k += 2)
      for (let x = Math.max(0, Math.ceil(xs[k]! - 0.5)); x <= Math.min(W - 1, Math.floor(xs[k + 1]! - 0.5)); x++) into[y * W + x] = 1;
  }
}

/** Min-heap of pixel indices keyed by cost. */
class Heap {
  private k: number[] = [];
  private v: number[] = [];
  get size() { return this.v.length; }
  push(v: number, k: number) {
    let i = this.v.length;
    this.v.push(v); this.k.push(k);
    while (i > 0) { const p = (i - 1) >> 1; if (this.k[p]! <= k) break; this.swap(i, p); i = p; }
  }
  pop(): number {
    const top = this.v[0]!;
    const lv = this.v.pop()!, lk = this.k.pop()!;
    if (this.v.length) {
      this.v[0] = lv; this.k[0] = lk;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < this.v.length && this.k[l]! < this.k[m]!) m = l;
        if (r < this.v.length && this.k[r]! < this.k[m]!) m = r;
        if (m === i) break;
        this.swap(i, m); i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number) {
    [this.v[a], this.v[b]] = [this.v[b]!, this.v[a]!];
    [this.k[a], this.k[b]] = [this.k[b]!, this.k[a]!];
  }
}

/** Scribbles: grow through similar colours from the seeds; walls are never crossed. */
function grow(lab: Lab, W: number, H: number, seeds: Uint8Array, walls: Uint8Array): Uint8Array {
  const n = W * H;
  const idx: number[] = [];
  for (let i = 0; i < n; i++) if (seeds[i] && !walls[i]) idx.push(i);
  const out = new Uint8Array(n);
  if (!idx.length) return out;
  const c = centres(lab, idx, 4, 0.2);
  const spread = idx.map((i) => nearest(lab, i, c)).sort((a, b) => a - b);
  const tol = Math.min(30, Math.max(9, 2 * (spread[Math.floor(spread.length * 0.9)] ?? 0)));
  // Colour cost per pixel, once: how far it is from the stroke's colours, beyond the tolerance.
  const colour = new Float32Array(n);
  for (let j = 0; j < n; j++) colour[j] = Math.max(0, nearest(lab, j, c) - tol) / tol;
  const diff = (a: number, b: number) =>
    Math.hypot(lab[a * 3]! - lab[b * 3]!, lab[a * 3 + 1]! - lab[b * 3 + 1]!, lab[a * 3 + 2]! - lab[b * 3 + 2]!);
  // Typical neighbour difference = "texture"; only differences well above it count as edges.
  let mean = 0;
  for (let k = 0; k < n - 1; k++) mean += diff(k, k + 1);
  mean = mean / n + 0.5;
  // Spread is limited relative to the stroke: a short scribble selects nearby, not the whole photo.
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (const k of idx) { const x = k % W, y = (k - x) / W; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const reach = Math.max(0.25 * Math.max(W, H), 1.5 * Math.hypot(x1 - x0, y1 - y0));
  const LIMIT = 1.5;
  const cost = new Float64Array(n).fill(Infinity);
  const heap = new Heap();
  for (const k of idx) { cost[k] = 0; heap.push(k, 0); }
  // Dijkstra: each pixel is settled once; the pop budget guarantees it can't run away.
  for (let budget = 8 * n; heap.size && budget > 0; budget--) {
    const i = heap.pop();
    if (out[i]) continue; // already settled (stale entry)
    const ci = cost[i]!;
    if (ci > LIMIT) break;
    out[i] = 1;
    const x = i % W;
    for (const j of [i + 1, i - 1, i + W, i - W]) {
      if (j < 0 || j >= n || Math.abs((j % W) - x) > 1 || walls[j] || out[j]) continue;
      const v = ci + colour[j]! + Math.max(0, diff(i, j) - 2 * mean) / (4 * mean) + 1 / reach;
      if (v < cost[j]!) { cost[j] = v; heap.push(j, v); }
    }
  }
  return out;
}

/** Lasso: the object inside the loop, separated from what surrounds it by colour. */
function lasso(lab: Lab, W: number, H: number, inside: Uint8Array, walls: Uint8Array): Uint8Array {
  const n = W * H;
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let i = 0; i < n; i++) if (inside[i]) { const x = i % W, y = (i - x) / W; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const out = new Uint8Array(n);
  if (x1 < x0) return out;
  const m = Math.round(Math.max(x1 - x0, y1 - y0) * 0.2) + 2;
  const fg: number[] = [], bg: number[] = [];
  for (let y = Math.max(0, y0 - m); y <= Math.min(H - 1, y1 + m); y++)
    for (let x = Math.max(0, x0 - m); x <= Math.min(W - 1, x1 + m); x++) { const i = y * W + x; (inside[i] && !walls[i] ? fg : bg).push(i); }
  for (let i = 0; i < n; i++) if (walls[i] && inside[i]) bg.push(i);
  const B = centres(lab, bg, 6);
  let F = centres(lab, fg, 6);
  for (let it = 0; it < 3; it++) {
    const keep: number[] = [];
    for (const i of fg) {
      const v = !B.length || nearest(lab, i, F) < nearest(lab, i, B) ? 1 : 0;
      out[i] = v;
      if (v) keep.push(i);
    }
    if (!keep.length) break;
    F = centres(lab, keep, 6);
  }
  // Keep the solid parts: components at least 8% of the biggest one.
  const comp = new Int32Array(n).fill(-1);
  const sizes: number[] = [];
  for (const s of fg) {
    if (!out[s] || comp[s]! >= 0) continue;
    const id = sizes.length, stack = [s];
    comp[s] = id;
    let size = 0;
    while (stack.length) {
      const i = stack.pop()!;
      size++;
      const x = i % W;
      for (const j of [i - 1, i + 1, i - W, i + W]) {
        if (j < 0 || j >= n || (Math.abs((j % W) - x) > 1) || !out[j] || comp[j]! >= 0) continue;
        comp[j] = id;
        stack.push(j);
      }
    }
    sizes.push(size);
  }
  const big = Math.max(0, ...sizes);
  for (let i = 0; i < n; i++) if (out[i] && sizes[comp[i]!]! < big * 0.08) out[i] = 0;
  return out;
}

function boxMean(src: Float32Array, W: number, H: number, r: number): Float32Array {
  const S = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) {
    let row = 0;
    for (let x = 0; x < W; x++) { row += src[y * W + x]!; S[(y + 1) * (W + 1) + x + 1] = S[y * (W + 1) + x + 1]! + row; }
  }
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const ya = Math.max(0, y - r), yb = Math.min(H, y + r + 1);
    for (let x = 0; x < W; x++) {
      const xa = Math.max(0, x - r), xb = Math.min(W, x + r + 1);
      const sum = S[yb * (W + 1) + xb]! - S[ya * (W + 1) + xb]! - S[yb * (W + 1) + xa]! + S[ya * (W + 1) + xa]!;
      out[y * W + x] = sum / ((yb - ya) * (xb - xa));
    }
  }
  return out;
}

/** Guided filter (He et al.): smooths `p` but keeps the guide's edges. */
function guided(guide: Float32Array, p: Float32Array, W: number, H: number, r: number, eps: number): Float32Array {
  const n = W * H;
  const Ip = new Float32Array(n), II = new Float32Array(n);
  for (let i = 0; i < n; i++) { Ip[i] = guide[i]! * p[i]!; II[i] = guide[i]! * guide[i]!; }
  const mI = boxMean(guide, W, H, r), mP = boxMean(p, W, H, r), mIp = boxMean(Ip, W, H, r), mII = boxMean(II, W, H, r);
  const a = new Float32Array(n), b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const v = mII[i]! - mI[i]! * mI[i]!;
    a[i] = (mIp[i]! - mI[i]! * mP[i]!) / (v + eps);
    b[i] = mP[i]! - a[i]! * mI[i]!;
  }
  const ma = boxMean(a, W, H, r), mb = boxMean(b, W, H, r);
  const q = new Float32Array(n);
  for (let i = 0; i < n; i++) q[i] = Math.min(1, Math.max(0, ma[i]! * guide[i]! + mb[i]!));
  return q;
}

/**
 * Alpha (0..1, row-major, same size as `img`) of what the `want` strokes point at. Strokes of
 * the other tool are walls. Empty when there are no `want` strokes.
 */
export function smartSelect(img: Pixels, strokes: Guide[], want: Guide["tool"]): Float32Array {
  const { width: W, height: H } = img;
  const n = W * H;
  const lab = toLab(img);
  const r = Math.max(1.5, Math.max(W, H) * 0.012);
  const walls = new Uint8Array(n);
  for (const s of strokes) if (s.tool !== want) (s.loop ? rasterPoly : (p: Guide["pts"], w: number, h: number, into: Uint8Array) => rasterLine(p, w, h, r, into))(s.pts, W, H, walls);
  const hard = new Uint8Array(n);
  const seeds = new Uint8Array(n);
  let scribbles = false;
  for (const s of strokes) {
    if (s.tool !== want) continue;
    if (s.loop) {
      const inside = new Uint8Array(n);
      rasterPoly(s.pts, W, H, inside);
      const sel = lasso(lab, W, H, inside, walls);
      for (let i = 0; i < n; i++) if (sel[i]) hard[i] = 1;
    } else {
      rasterLine(s.pts, W, H, r, seeds);
      scribbles = true;
    }
  }
  if (scribbles) { const g = grow(lab, W, H, seeds, walls); for (let i = 0; i < n; i++) if (g[i]) hard[i] = 1; }
  const gray = new Float32Array(n);
  const p = new Float32Array(n);
  for (let i = 0; i < n; i++) { gray[i] = lab[i * 3]! / 100; p[i] = hard[i]!; }
  return guided(gray, p, W, H, Math.max(2, Math.round(Math.max(W, H) / 120)), 1e-3);
}
