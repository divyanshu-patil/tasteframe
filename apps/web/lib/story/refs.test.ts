import { describe, expect, it } from "vitest";
import { editorReducer } from "./editor";
import { defaultState } from "./templates";

const input = { headline: "lake day", caption: "", accent: "#c03f13", palette: [], date: new Date(2026, 9, 10), focus: { x: 0.45, y: 0.3 } };

describe("movable strips and windows", () => {
  it("starts the torn strip and focus strip at eye level", () => {
    const torn = defaultState("tornstrip", input).spot!;
    expect(torn.x).toBe(0);
    expect(torn.w).toBe(1);
    expect(torn.y + torn.h / 2).toBeCloseTo(0.27, 2); // centred just above the subject point
    expect(defaultState("focus", input).spot!.y).toBeGreaterThan(0.12);
  });

  it("drags the strip vertically and keeps it on the Story", () => {
    const s = defaultState("tornstrip", input);
    const down = editorReducer(s, { type: "spot", x: 0.3, y: 0.5 });
    expect(down.spot).toMatchObject({ x: 0, y: 0.5 }); // full-width strips can't slide sideways
    const off = editorReducer(s, { type: "spot", x: 0, y: 2 });
    expect(off.spot!.y + off.spot!.h).toBeCloseTo(1);
  });

  it("only layouts with a window carry one", () => {
    expect(defaultState("editorial", input).spot).toBeUndefined();
    expect(defaultState("colorbox", input).spot).toBeDefined();
  });
});

describe("layout-placed elements", () => {
  it("places the kiss mark on the face as a draggable sticker", () => {
    const s = defaultState("kissmark", input);
    const kiss = s.stickers.find((x) => x.kind === "kiss")!;
    expect(kiss).toMatchObject({ x: 0.45, layout: true });
    expect(kiss.y).toBeCloseTo(0.31);
  });

  it("swaps layout elements on layout change but keeps the user's own stickers", () => {
    let s = defaultState("kissmark", input);
    s = editorReducer(s, { type: "sticker-add", sticker: { id: "mine", kind: "star", x: 0.5, y: 0.5, scale: 1, rotate: 0, color: "#d9a62e" } });
    const next = editorReducer(s, { type: "template", id: "camcorder", input });
    expect(next.stickers.map((x) => x.id)).toContain("mine");
    expect(next.stickers.some((x) => x.kind === "kiss")).toBe(false);
    expect(next.stickers.some((x) => x.kind === "brackets" && x.layout)).toBe(true);
  });

  it("outline width is configurable and clamped", () => {
    const s = editorReducer(defaultState("cutout", input), { type: "outline", patch: { width: 99, color: "#ff0000" } });
    expect(s.outline).toEqual({ show: true, color: "#ff0000", width: 40, margin: 0 });
  });
});

describe("auto-fit headlines", () => {
  it("shrinks a long single word to the layer width", async () => {
    const { drawText } = await import("./draw");
    const { fakeCtx } = await import("./fakeCtx");
    const layer = { text: "CELEBRATION", size: 210, color: "#fff", align: "center" as const, x: 0.5, y: 0.1, width: 0.9, font: "sans" as const };
    const wide = drawText(fakeCtx().ctx, layer);
    const fit = drawText(fakeCtx().ctx, layer, { fit: true });
    expect(wide.w).toBeGreaterThan(0.9 * 1080);
    expect(fit.w).toBeLessThanOrEqual(0.9 * 1080 + 1);
  });
});
