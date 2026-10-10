import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio, readableOn } from "./draw";
import { fakeCtx } from "./fakeCtx";
import { TEMPLATES, defaultState, renderStory, stampFor } from "./templates";
import { SAFE, TEMPLATE_IDS, STORY_H, STORY_W } from "./types";

const input = { headline: "golden hour, again.", caption: "now playing — Song · Artist", accent: "#c03f13", palette: ["#202020", "#c87830"], date: new Date(2026, 9, 10) };
const photo = { width: 1200, height: 1600 } as unknown as CanvasImageSource & { width: number; height: number };

describe("template catalogue", () => {
  it("matches the API ranking catalogue ids", () => {
    const py = readFileSync(join(__dirname, "../../../api/app/services/recommendations/layouts.py"), "utf8");
    const ids = [...py.matchAll(/Template\(\s*"(\w+)"/g)].map((m) => m[1]);
    expect(new Set(ids)).toEqual(new Set(TEMPLATE_IDS));
  });

  it.each(TEMPLATE_IDS)("%s: defaults keep text inside Instagram safe areas", (id) => {
    const s = defaultState(id, input);
    for (const layer of [s.headline, s.caption]) {
      expect(layer.y).toBeGreaterThanOrEqual(SAFE.top - 0.12); // within or just under the profile bar
      expect(layer.y).toBeLessThan(SAFE.bottom);
      expect(layer.size).toBeGreaterThan(12);
    }
    expect(JSON.parse(JSON.stringify(s))).toEqual(s); // serializable
  });

  it.each(TEMPLATE_IDS)("%s: renders deterministically and returns hit boxes", (id) => {
    const s = defaultState(id, input);
    const a = fakeCtx();
    const b = fakeCtx();
    const hits = renderStory(a.ctx, photo, s);
    renderStory(b.ctx, photo, s);
    expect(a.calls).toEqual(b.calls);
    // The headline is drawn (some layouts derive it, e.g. the stacked weekday).
    expect(a.texts.join(" ").toLowerCase()).toContain(s.headline.text.split(/\s/)[0]!.toLowerCase());
    expect(hits.headline.w).toBeGreaterThan(0);
    expect(hits.headline.x).toBeGreaterThanOrEqual(0);
    expect(hits.headline.x + hits.headline.w).toBeLessThanOrEqual(STORY_W);
    expect(hits.caption.y + hits.caption.h).toBeLessThanOrEqual(STORY_H);
  });

  it("layouts are compositionally distinct (different draw sequences)", () => {
    const seqs = TEMPLATE_IDS.map((id) => {
      const f = fakeCtx();
      renderStory(f.ctx, photo, defaultState(id, input));
      return f.calls.join(",");
    });
    expect(new Set(seqs).size).toBe(TEMPLATE_IDS.length);
  });

  it("decoration toggles change output", () => {
    const s = defaultState("scrapbook", input);
    const on = fakeCtx();
    const off = fakeCtx();
    renderStory(on.ctx, photo, s);
    renderStory(off.ctx, photo, { ...s, decorations: { ...s.decorations, stars: false, stamp: false } });
    expect(off.calls.length).toBeLessThan(on.calls.length);
  });

  it("every template exposes labelled decorations matching its defaults", () => {
    for (const id of TEMPLATE_IDS) {
      const keys = TEMPLATES[id].decorations.map((d) => d.key).sort();
      expect(Object.keys(defaultState(id, input).decorations).sort()).toEqual(keys);
    }
  });

  it("keeps text readable and stamps dates deterministically", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio(readableOn("#0b0a09", "#111111"), "#0b0a09")).toBeGreaterThanOrEqual(3);
    expect(stampFor(new Date(2026, 0, 5))).toBe("'26 01 05");
  });
});

describe("subject-aware framing (selfies/portraits)", () => {
  const base = { headline: "h", caption: "c", accent: "#c03f13", palette: [], date: new Date(2026, 9, 10) };

  it("aims the default crop at the subject", () => {
    const s = defaultState("minimal", { ...base, focus: { x: 0.7, y: 0.25 } });
    expect(s.crop).toEqual({ zoom: 1, x: 0.7, y: 0.25, fit: "cover" });
    expect(defaultState("minimal", base).crop).toEqual({ zoom: 1, x: 0.5, y: 0.5, fit: "cover" });
  });

  it("moves text that sits on the photo away from the subject", () => {
    // Face in the lower part → Cinematic text goes to the top (and back down otherwise).
    expect(defaultState("cinematic", { ...base, focus: { x: 0.5, y: 0.8 } }).headline.y).toBeLessThan(0.3);
    expect(defaultState("cinematic", { ...base, focus: { x: 0.5, y: 0.3 } }).headline.y).toBeGreaterThan(0.5);
    // Face in the upper part → Vintage text drops below it; default stays at the top.
    expect(defaultState("vintage", { ...base, focus: { x: 0.5, y: 0.35 } }).headline.y).toBeGreaterThan(0.5);
    expect(defaultState("vintage", base).headline.y).toBeLessThan(0.3);
  });

  it("keeps every text layer inside Instagram's safe area with any focus", () => {
    for (const id of TEMPLATE_IDS) {
      for (const y of [0.1, 0.5, 0.9]) {
        const s = defaultState(id, { ...base, focus: { x: 0.5, y } });
        for (const l of [s.headline, s.caption]) {
          expect(l.y).toBeGreaterThanOrEqual(SAFE.top - 0.12);
          expect(l.y).toBeLessThan(SAFE.bottom);
        }
      }
    }
  });
});

describe("filters, stickers, contain-fit", () => {
  it("filters are pure pixel functions with distinct looks", async () => {
    const { FILTER_IDS, applyFilterPixel } = await import("./filters");
    const px: [number, number, number] = [200, 120, 60];
    const outs = FILTER_IDS.map((id) => applyFilterPixel(id, px).map((v) => Math.round(v)).join(","));
    expect(new Set(outs).size).toBe(FILTER_IDS.length);
    const [r, g, b] = applyFilterPixel("bw", px);
    expect(r).toBe(g);
    expect(g).toBe(b);
    expect(applyFilterPixel("none", px)).toEqual(px);
  });

  it("renders stickers on top of every template and supports contain-fit", async () => {
    const { STICKER_KINDS } = await import("./stickers");
    const base = defaultState("cinematic", input);
    const stickers = STICKER_KINDS.map((k, i) => ({ id: String(i), kind: k.kind, x: 0.5, y: 0.5, scale: 1, rotate: 15, color: k.color, text: "hi" }));
    for (const id of TEMPLATE_IDS) {
      const f = fakeCtx();
      expect(() => renderStory(f.ctx, photo, { ...defaultState(id, input), stickers, crop: { ...base.crop, fit: "contain" } })).not.toThrow();
    }
  });

  it("uses the suggested filter, else the template's signature look", () => {
    expect(defaultState("newspaper", input).filter).toBe("bw");
    expect(defaultState("newspaper", { ...input, filter: "warm" }).filter).toBe("warm");
    expect(defaultState("cinematic", input).filter).toBe("none");
  });
});

describe("multi-photo slots", () => {
  const ph = (w: number) => ({ width: w, height: 1200 }) as unknown as CanvasImageSource & { width: number; height: number };
  const four = [ph(800), ph(900), ph(1000), ph(1100)];

  it("maps slots to photos by order and cycles when there are fewer photos", async () => {
    const { makeSlots } = await import("./templates");
    const s = { ...defaultState("grid", input), order: [2, 0, 1, 3] };
    const slots = makeSlots(four, s);
    expect(slots.count).toBe(4);
    expect(slots.photo(0)).toBe(four[2]);
    expect(slots.photo(1)).toBe(four[0]);
    const two = makeSlots(four.slice(0, 2), defaultState("grid", input));
    expect(two.own(1)).toBe(true);
    expect(two.own(2)).toBe(false);
    expect(two.photo(2)).toBe(four[0]); // cycles
  });

  it("swap keeps each photo's own crop", async () => {
    const { editorReducer } = await import("./editor");
    let s = defaultState("duo", { ...input, focuses: [{ x: 0.2, y: 0.3 }, { x: 0.8, y: 0.6 }] });
    expect(s.crop).toMatchObject({ x: 0.2, y: 0.3 });
    expect(s.crops[0]).toMatchObject({ x: 0.8, y: 0.6 });
    s = editorReducer(s, { type: "swap", a: 0, b: 1 });
    expect(s.order.slice(0, 2)).toEqual([1, 0]);
    expect(s.crop).toMatchObject({ x: 0.8, y: 0.6 });
    expect(s.crops[0]).toMatchObject({ x: 0.2, y: 0.3 });
    // Crop edits target one slot.
    s = editorReducer(s, { type: "crop", slot: 1, patch: { zoom: 2 } });
    expect(s.crops[0]!.zoom).toBe(2);
    expect(s.crop.zoom).toBe(1);
  });

  it("every layout renders with 1–4 photos; slot rects stay on the canvas", async () => {
    const { slotRectsFor } = await import("./templates");
    for (const id of TEMPLATE_IDS) {
      for (const n of [1, 2, 3, 4]) {
        const s = defaultState(id, input);
        const f = fakeCtx();
        expect(() => renderStory(f.ctx, four.slice(0, n), s)).not.toThrow();
        for (const r of slotRectsFor(s, n)) {
          expect(r.x).toBeGreaterThanOrEqual(0);
          expect(r.y).toBeGreaterThanOrEqual(0);
          expect(r.x + r.w).toBeLessThanOrEqual(STORY_W);
          expect(r.y + r.h).toBeLessThanOrEqual(STORY_H);
        }
      }
    }
  });

  it("multi-photo layouts expose as many slots as their capacity", async () => {
    const { slotRectsFor } = await import("./templates");
    const caps: Record<string, number> = { duo: 2, splitscreen: 2, booth: 3, torncollage: 3, grid: 4, mosaic: 4, polaroids: 4 };
    for (const [id, cap] of Object.entries(caps)) {
      const s = defaultState(id as (typeof TEMPLATE_IDS)[number], input);
      expect(slotRectsFor(s, 4)).toHaveLength(cap);
      expect(TEMPLATES[id as (typeof TEMPLATE_IDS)[number]].capacity).toBe(cap);
    }
  });
});
