import { describe, expect, it } from "vitest";
import { editorReducer } from "./editor";
import { fakeCtx } from "./fakeCtx";
import { fill } from "./spec";
import { defaultState, renderStory } from "./templates";

const input = {
  headline: "hello", caption: "world", accent: "#c03f13", palette: [], date: new Date(2026, 9, 10),
  focus: { x: 0.3, y: 0.35 }, music: { title: "golden hour", artist: "JVKE", trackId: 11 },
};
const photo = { width: 1200, height: 1600 } as never;

describe("song cover", () => {
  it("cover layouts show it; Cover Over Face sits on the subject", () => {
    const s = defaultState("coverface", input);
    expect(s.cover).toMatchObject({ show: true, style: "plain", x: 0.3, trackId: 11, title: "golden hour" });
    expect(s.cover!.y).toBeCloseTo(0.31);
    expect(s.cover!.scale).toBe(1.3);
    expect(defaultState("editorial", input).cover?.show).toBe(false);
  });

  it("renders the cover with the song title and clamps edits", () => {
    const s = defaultState("coverfloat", input);
    const f = fakeCtx();
    renderStory(f.ctx, photo, s);
    expect(f.texts).toContain("golden hour");
    const moved = editorReducer(s, { type: "cover", patch: { x: 2, scale: 99 } });
    expect(moved.cover).toMatchObject({ x: 1, scale: 4 });
  });

  it("keeps the chosen song and a user-placed cover across layout switches", () => {
    let s = defaultState("editorial", input);
    s = editorReducer(s, { type: "cover", patch: { show: true, x: 0.2, trackId: 42, title: "other" } });
    const plain = editorReducer(s, { type: "template", id: "minimal", input });
    expect(plain.cover).toMatchObject({ show: true, x: 0.2, trackId: 42, title: "other" });
    const coverLayout = editorReducer(s, { type: "template", id: "coversingle", input });
    expect(coverLayout.cover).toMatchObject({ show: true, x: 0.5, scale: 2.3, trackId: 42 });
    // Leaving a song-cover layout drops its cover (but keeps the song).
    const after = editorReducer(coverLayout, { type: "template", id: "minimal", input });
    expect(after.cover).toMatchObject({ show: false, trackId: 42 });
  });

  it("fills date placeholders from the stamp", () => {
    const s = defaultState("weekday", input); // 2026-10-10 is a Saturday
    expect(fill("{WD3} {wdA}|{wdB} {day}.{mm}.{yy} {MONTH}", s)).toBe("SAT satu|rday 10.10.26 OCTOBER");
    expect(s.headline.text).toBe("sat\nur\nday");
  });
});
