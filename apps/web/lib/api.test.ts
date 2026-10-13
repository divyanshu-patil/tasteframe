import { describe, expect, it } from "vitest";
import { ApiError, type Music, musicFor, parseAnalysis, parseCandidates, readAnalysisStream } from "./api";

const valid = {
  analysis_id: "a",
  visual_profile: { palette: ["#112233"], brightness: 0.4, contrast: 0.5, saturation: 0.3, warmth: 0.1, composition: "portrait", mood: ["warm"], source: "vision" },
  cultural_recommendations: [{ provider: "qloo", kind: "artist", entity_id: "x", name: "Artist", tags: [], reason: "r", evidence: ["Seed"] }],
  layouts: [
    { id: "cinematic", name: "Cinematic", reason: "r", style_tags: [], score: { visual_fit: 1, cultural_style_fit: 0.5, readability_fit: 0.7, total: 0.8 }, headline: "h", caption: "c", accent: "#c03f13" },
    { id: "not-a-template", name: "x", reason: "r", style_tags: [], score: {}, headline: "h", caption: "c", accent: "#c03f13" },
  ],
  music: { kind: "track", artist: "Artist", title: "Song", url: "https://music.apple.com/us/album/x", artist_source: "qloo", track_source: "itunes", explanation: "e" },
  provenance: { qloo_used: true, qloo_error: null, visual_analysis_used: true, track_level_result: true, seeds: ["Seed"], layout_rule: "x" },
};

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      chunks.forEach((x) => c.enqueue(enc.encode(x)));
      c.close();
    },
  });
}

describe("response validation", () => {
  it("accepts valid analysis and drops unknown layouts", () => {
    const a = parseAnalysis(valid);
    expect(a.layouts.map((l) => l.id)).toEqual(["cinematic"]);
    expect(a.music.title).toBe("Song");
  });

  it("strips untrusted music links and rejects unverified track titles", () => {
    const evil = parseAnalysis({ ...valid, music: { ...valid.music, url: "javascript:alert(1)" } });
    expect(evil.music.url).toBeNull();
    expect(() => parseAnalysis({ ...valid, music: { ...valid.music, track_source: null } })).toThrow(ApiError);
  });

  it("keeps the photo vibe and validates alternative songs", () => {
    const alts = [
      { title: "A", artist: "X", url: "https://evil.example", track_id: 3 },
      { title: 5, artist: "Y" },
      { title: "B", artist: "Z", url: "https://music.apple.com/us/album/b", trending: "reels" },
    ];
    const m = parseAnalysis({ ...valid, music: { ...valid.music, vibe: "baddie", alternatives: alts } }).music;
    expect(m.vibe).toBe("baddie");
    expect(parseAnalysis({ ...valid, music: { ...valid.music, trending: "viral!" } }).music.trending).toBeNull();
    expect(m.alternatives).toEqual([
      { title: "A", artist: "X", url: null, track_id: 3, trending: null, source: "vibe", why: null },
      { title: "B", artist: "Z", url: "https://music.apple.com/us/album/b", track_id: null, trending: "reels", source: "vibe", why: null },
    ]);
    expect(parseAnalysis(valid).music.alternatives).toEqual([]);
  });

  it("rejects malformed payloads and empty layout lists", () => {
    expect(() => parseAnalysis(null)).toThrow(ApiError);
    expect(() => parseAnalysis({ ...valid, layouts: [] })).toThrow(ApiError);
    expect(() => parseAnalysis({ ...valid, visual_profile: { ...valid.visual_profile, palette: ["red"] } })).toThrow(ApiError);
  });

  it("parses candidates defensively", () => {
    expect(parseCandidates({ candidates: [{ entity_id: "1", name: "A" }, { name: "no id" }] })).toHaveLength(1);
    expect(() => parseCandidates({})).toThrow(ApiError);
  });
});

describe("analysis stream", () => {
  it("reports real stages and returns the result, across chunk boundaries", async () => {
    const stages: string[] = [];
    const body = `{"stage":"photo"}\n{"stage":"mood"}\n{"result":${JSON.stringify(valid)}}\n`;
    const result = await readAnalysisStream(streamOf([body.slice(0, 10), body.slice(10, 40), body.slice(40)]), (s) => stages.push(s));
    expect(stages).toEqual(["photo", "mood"]);
    expect(result.analysis_id).toBe("a");
  });

  it("resolves with the layouts first, then delivers the songs event", async () => {
    const pending = { ...valid, music: { kind: "none", explanation: "…" }, music_pending: true };
    const song = { ...valid.music, title: "Later" };
    const body = `{"result":${JSON.stringify(pending)}}\n{"music":${JSON.stringify(song)}}\n`;
    let got: Music | null | undefined;
    const arrived = new Promise<void>((r) => {
      void readAnalysisStream(streamOf([body]), () => undefined, (m) => { got = m; r(); }).then((a) => {
        expect(a.music_pending).toBe(true);
        expect(a.music.kind).toBe("none");
      });
    });
    await arrived;
    expect(got?.title).toBe("Later");
    // A stream that ends without songs reports null instead of hanging.
    const none = new Promise<Music | null>((r) => {
      void readAnalysisStream(streamOf([`{"result":${JSON.stringify(pending)}}\n`]), () => undefined, r);
    });
    expect(await none).toBeNull();
  });

  it("gives each layout its own song, in rank order", () => {
    const alt = (t: string) => ({ title: t, artist: "B", url: null, track_id: null, trending: null, source: "vibe" as const, why: null });
    const m = parseAnalysis({ ...valid, music: { ...valid.music, alternatives: [alt("2"), alt("3")] } }).music;
    expect([0, 1, 2, 3].map((i) => musicFor(m, i).title)).toEqual(["Song", "2", "3", "Song"]);
    expect(musicFor(m, 1).alternatives.map((a) => a.title)).toEqual(["3", "Song"]);
    expect(musicFor(m, 1).artist_source).toBe("vibe");
  });

  it("surfaces safe error events", async () => {
    const err = await readAnalysisStream(
      streamOf(['{"stage":"photo"}\n{"error":{"code":"INVALID_IMAGE","message":"bad","retryable":false}}\n']),
      () => undefined,
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("INVALID_IMAGE");
  });

  it("fails clearly on a truncated stream", async () => {
    await expect(readAnalysisStream(streamOf(['{"stage":"photo"}\n']), () => undefined)).rejects.toMatchObject({ code: "BAD_RESPONSE" });
  });
});

describe("saved story parsing", () => {
  it("round-trips a real template state and rejects tampered ones", async () => {
    const { defaultState } = await import("./story/templates");
    const { parseStoryState } = await import("./api");
    const state = defaultState("scrapbook", { headline: "h", caption: "c", accent: "#c03f13", palette: [], date: new Date(2026, 9, 10) });
    expect(parseStoryState(JSON.parse(JSON.stringify(state)))).toEqual(state);
    expect(parseStoryState({ ...state, templateId: "evil" })).toBeNull();
    expect(parseStoryState({ ...state, headline: { text: 1 } })).toBeNull();
    expect(parseStoryState(null)).toBeNull();
  });
});

describe("image reasoning parsing", () => {
  it("keeps valid reasoning, filters unknown moods, tolerates absence", () => {
    const withIr = parseAnalysis({
      ...valid,
      image_reasoning: { provider: "ollama", model: "gemma4:31b", summary: "warm dusk", moods: ["warm", "serene"], scene: ["hills"], headline_ideas: ["after the light"] },
    });
    expect(withIr.image_reasoning).toMatchObject({ model: "gemma4:31b", moods: ["warm"], headline_ideas: ["after the light"] });
    expect(parseAnalysis(valid).image_reasoning).toBeNull();
    expect(parseAnalysis({ ...valid, image_reasoning: { summary: 3 } }).image_reasoning).toBeNull();
  });
});
