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
