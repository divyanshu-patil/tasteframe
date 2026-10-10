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
    expect(a.texts.join(" ")).toContain("golden");
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
