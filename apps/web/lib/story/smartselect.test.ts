import { describe, expect, it } from "vitest";
import { smartSelect } from "./smartselect";

// 100×100: blue background with noise, a red square at 30..69.
function scene() {
  const W = 100, H = 100, data = new Uint8ClampedArray(W * H * 4);
  let seed = 7;
  const noise = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31 - 0.5) * 24;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, sq = x >= 30 && x < 70 && y >= 30 && y < 70;
      data[i] = (sq ? 210 : 40) + noise(); data[i + 1] = (sq ? 50 : 70) + noise(); data[i + 2] = (sq ? 60 : 190) + noise(); data[i + 3] = 255;
    }
  return { data, width: W, height: H };
}
const score = (a: Float32Array) => {
  let inSq = 0, out = 0;
  for (let y = 0; y < 100; y++) for (let x = 0; x < 100; x++) {
    const sq = x >= 30 && x < 70 && y >= 30 && y < 70;
    if (a[y * 100 + x]! > 0.5) sq ? inSq++ : out++;
  }
  return { covered: inSq / 1600, spill: out / 8400 };
};

describe("smartSelect", () => {
  it("grows a scribble to the whole object and stops at its edges", () => {
    const a = smartSelect(scene(), [{ tool: "add", loop: false, pts: [{ x: 0.4, y: 0.45 }, { x: 0.55, y: 0.5 }] }], "add");
    const s = score(a);
    expect(s.covered).toBeGreaterThan(0.95);
    expect(s.spill).toBeLessThan(0.02);
  });

  it("selects the object inside a rough circle, not the background inside it", () => {
    const pts = Array.from({ length: 24 }, (_, i) => ({ x: 0.5 + 0.3 * Math.cos((i / 24) * Math.PI * 2), y: 0.5 + 0.3 * Math.sin((i / 24) * Math.PI * 2) }));
    const s = score(smartSelect(scene(), [{ tool: "add", loop: true, pts }], "add"));
    expect(s.covered).toBeGreaterThan(0.9);
    expect(s.spill).toBeLessThan(0.02);
  });

  it("never crosses a stroke of the other kind", () => {
    const a = smartSelect(scene(), [
      { tool: "add", loop: false, pts: [{ x: 0.35, y: 0.5 }, { x: 0.4, y: 0.5 }] },
      { tool: "erase", loop: false, pts: [{ x: 0.5, y: 0.25 }, { x: 0.5, y: 0.75 }] },
    ], "add");
    let right = 0;
    for (let y = 30; y < 70; y++) for (let x = 55; x < 70; x++) right += a[y * 100 + x]! > 0.5 ? 1 : 0;
    expect(right).toBe(0);
    expect(score(a).covered).toBeGreaterThan(0.4);
  });

  it("returns nothing without strokes of the wanted kind", () => {
    const a = smartSelect(scene(), [{ tool: "erase", loop: false, pts: [{ x: 0.5, y: 0.5 }] }], "add");
    expect(a.every((v) => v < 0.5)).toBe(true);
  });
});
