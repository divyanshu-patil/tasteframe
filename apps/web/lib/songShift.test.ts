import { describe, expect, it } from "vitest";
import type { Analysis, LayoutSuggestion, Music, Song } from "./api";
import { setSongShift, songShift } from "./songShift";
import { inputFor, songFor } from "./story/input";

const song = (title: string): Song => ({ title, artist: "A", url: null, track_id: null, preview_url: null, trending: null, source: "vibe", why: null });
const music: Music = {
  kind: "track", artist: "A", title: "one", url: null, artist_source: "vibe", track_source: "itunes", track_id: null,
  preview_url: null, explanation: "", vibe: null, alternatives: [song("two"), song("three")], trending: null, why: null,
};
const layout = (id: string) => ({ id }) as LayoutSuggestion;
const a = { analysis_id: "abc", music, layouts: [layout("cinematic"), layout("vintage"), layout("y2k")], visual_profile: { palette: [] }, image_reasoning: null } as unknown as Analysis;

describe("song shuffle", () => {
  it("puts the picked song on the best layout and the next ones after it", () => {
    expect(songFor(layout("cinematic"), a)?.title).toBe("one");
    setSongShift("abc", 2);
    expect(songFor(layout("cinematic"), a)?.title).toBe("three");
    expect(songFor(layout("vintage"), a)?.title).toBe("one");
    expect(inputFor(layout("cinematic"), a, new Date()).music?.title).toBe("three"); // the editor follows
    expect(songShift("other-analysis")).toBe(0); // a new analysis starts from its own lead
    setSongShift("abc", 0);
  });
});
