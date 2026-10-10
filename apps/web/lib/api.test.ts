import { describe, expect, it } from "vitest";
import { ApiError, parseAnalysis, parseCandidates, readAnalysisStream } from "./api";

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
