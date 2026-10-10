import { describe, expect, it } from "vitest";
import { editorReducer } from "./editor";
import { exportFilename } from "./export";
import { defaultState } from "./templates";
import { STORY_H, STORY_W } from "./types";

const input = { headline: "hello", caption: "world", accent: "#c03f13", palette: [], date: new Date(2026, 9, 10) };

describe("editor reducer", () => {
  const s0 = defaultState("editorial", input);

  it("edits text, size bounds and alignment", () => {
    let s = editorReducer(s0, { type: "text", key: "headline", patch: { text: "new words", align: "center" } });
    expect(s.headline.text).toBe("new words");
    expect(s.headline.align).toBe("center");
    s = editorReducer(s, { type: "text", key: "caption", patch: { size: 9999, color: "#ffffff" } });
    expect(s.caption.size).toBe(240);
    expect(s.caption.color).toBe("#ffffff");
    expect(s0.headline.text).toBe("hello"); // immutable
  });

  it("clamps moves and crop", () => {
    const s = editorReducer(s0, { type: "move", key: "caption", x: -1, y: 4 });
    expect(s.caption).toMatchObject({ x: 0, y: 0.97 });
    const c = editorReducer(s0, { type: "crop", patch: { zoom: 10, x: 2, y: -1 } });
    expect(c.crop).toEqual({ zoom: 3, x: 1, y: 0 });
  });

  it("toggles decorations and overlay", () => {
    const s = editorReducer(s0, { type: "decoration", key: "grid", on: false });
    expect(s.decorations.grid).toBe(false);
    expect(editorReducer(s0, { type: "overlay", patch: { strength: 3 } }).overlay.strength).toBe(1);
  });

  it("switching layout keeps the photo crop and the user's words", () => {
    let s = editorReducer(s0, { type: "text", key: "headline", patch: { text: "mine" } });
    s = editorReducer(s, { type: "crop", patch: { zoom: 2 } });
    const next = editorReducer(s, { type: "template", id: "vintage", input });
    expect(next.templateId).toBe("vintage");
    expect(next.headline.text).toBe("mine");
    expect(next.crop.zoom).toBe(2);
    expect(next.headline.font).toBe(defaultState("vintage", input).headline.font);
  });

  it("reset restores the template defaults", () => {
    const edited = editorReducer(s0, { type: "text", key: "headline", patch: { text: "x", size: 20 } });
    expect(editorReducer(edited, { type: "reset", input })).toEqual(s0);
  });

  it("export config: 1080×1920 and a safe filename", () => {
    expect([STORY_W, STORY_H]).toEqual([1080, 1920]);
    expect(exportFilename(s0, new Date("2026-10-10T12:00:00Z"))).toBe("tasteframe-editorial-2026-10-10.png");
    expect(exportFilename(s0)).toMatch(/^[a-z0-9-]+\.png$/);
  });
});
