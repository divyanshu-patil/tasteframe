// Browser client for the Tasteframe API. All calls go through the Next.js `/api` rewrite;
// no provider keys ever reach the browser. Responses are validated before use.
import { DEFAULT_COVER, normalizeCoverStyle } from "./story/cover";
import { accessToken } from "./auth";
import { FILTER_IDS, type FilterId } from "./story/filters";
import type { StoryState, TemplateId } from "./story/types";
import { TEMPLATE_IDS } from "./story/types";

export const API = "/api";

export type TasteType = "artist" | "movie" | "tv_show" | "brand" | "book" | "podcast";
export const MOODS = [
  "cinematic", "minimal", "nostalgic", "editorial", "warm", "cool",
  "moody", "bright", "playful", "dreamy", "bold", "natural",
] as const;
export type Mood = (typeof MOODS)[number];

export interface TasteCandidate {
  entity_id: string;
  name: string;
  entity_type: TasteType;
  disambiguation: string | null;
  image_url: string | null;
}
export interface VisualProfile {
  palette: string[];
  brightness: number;
  contrast: number;
  saturation: number;
  warmth: number;
  composition: "portrait" | "landscape" | "square";
  mood: Mood[];
  source: "vision" | "manual" | "vision+manual";
}
export interface LayoutSuggestion {
  id: TemplateId;
  name: string;
  reason: string;
  style_tags: string[];
  score: { visual_fit: number; cultural_style_fit: number; readability_fit: number; total: number };
  headline: string;
  caption: string;
  accent: string;
  focus_x: number;
  focus_y: number;
  /** Suggested photo filter for this layout (mood rules). */
  filter: FilterId;
  /** Crop focus per photo (multi-photo Stories). */
  focuses: { x: number; y: number }[];
  /** How many distinct photos this layout shows. */
  photo_slots: number;
  /** People who liked this layout, and whether it was added recently. */
  likes: number;
  is_new: boolean;
}
export interface CulturalRecommendation {
  provider: "qloo";
  kind: TasteType;
  entity_id: string;
  name: string;
  tags: string[];
  reason: string;
  evidence: string[];
}
/** Song languages (apps/api/app/services/music/vibes.py `Language`). */
export const LANGUAGES = [
  { id: "en", label: "English" },
  { id: "hi", label: "Hindi" },
  { id: "pa", label: "Punjabi" },
  { id: "es", label: "Spanish" },
  { id: "ko", label: "Korean" },
] as const;
export type Language = (typeof LANGUAGES)[number]["id"];
/** "chart": in Apple Music's most-played now; "reels": reported trending on Instagram Reels. */
export type Trend = "chart" | "reels";
const asTrend = (v: unknown): Trend | null => (v === "chart" || v === "reels" ? v : null);
export interface Song {
  title: string;
  artist: string;
  url: string | null;
  track_id: number | null;
  trending: Trend | null;
  /** "qloo": related to your favourites; "vibe": picked for the photo's vibe. */
  source: "qloo" | "vibe";
  /** The vision model's short reason this song fits the photo. */
  why: string | null;
}
export interface Music {
  kind: "track" | "artist" | "none";
  artist: string | null;
  title: string | null;
  url: string | null;
  /** "qloo": related to your favourites; "vibe": picked for the photo's vibe. */
  artist_source: "qloo" | "vibe" | null;
  track_source: "itunes" | null;
  /** Apple Music track id, for the square song cover. */
  track_id: number | null;
  explanation: string;
  /** How the photo reads, e.g. "baddie", "cute" (from pose/expression/mood). */
  vibe: string | null;
  alternatives: Song[];
  trending: Trend | null;
  why: string | null;
}
export interface ImageReasoning {
  provider: "ollama";
  model: string;
  summary: string;
  moods: Mood[];
  scene: string[];
  headline_ideas: string[];
  subject: "person" | "people" | "object" | "scene";
  /** What the image is about (taxonomy topic) and its major elements. */
  about: string | null;
  elements: string[];
}
export interface Analysis {
  analysis_id: string;
  image_reasoning: ImageReasoning | null;
  visual_profile: VisualProfile;
  cultural_recommendations: CulturalRecommendation[];
  layouts: LayoutSuggestion[];
  music: Music;
  /** Songs are still being picked; they arrive through `analyze`'s `onMusic`. */
  music_pending: boolean;
  /** Guests get the top 3 layouts; this many more unlock after login (`moreLayouts`). */
  locked_layouts: number;
  provenance: {
    qloo_used: boolean;
    qloo_error: string | null;
    visual_analysis_used: boolean;
    image_reasoning_used?: boolean;
    image_reasoning_error?: string | null;
    track_level_result: boolean;
    seeds: string[];
    layout_rule: string;
  };
}
export type Stage = "photo" | "mood" | "taste" | "layouts";

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public retryable = false,
  ) {
    super(message);
  }
}

// ---- validation -------------------------------------------------------------------------
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);
const HEX = /^#[0-9a-f]{6}$/i;
const SAFE_MUSIC_URL = /^https:\/\/music\.apple\.com\//;

/** Validated music suggestion (from the analysis result or the later `{music}` event). */
export function parseMusic(m: unknown): Music {
  const bad = () => new ApiError("BAD_RESPONSE", "Received an unexpected response.", true);
  if (!isObj(m) || !["track", "artist", "none"].includes(m.kind as string) || !isStr(m.explanation)) throw bad();
  // Only trust links on the provider domain we document; never render arbitrary URLs.
  const music = {
    ...m,
    url: isStr(m.url) && SAFE_MUSIC_URL.test(m.url) ? m.url : null,
    track_id: isNum(m.track_id) && Number.isInteger(m.track_id) && m.track_id > 0 ? m.track_id : null,
    vibe: isStr(m.vibe) ? m.vibe : null,
    trending: asTrend(m.trending),
    why: isStr(m.why) ? m.why : null,
    alternatives: Array.isArray(m.alternatives)
      ? m.alternatives
          .filter((a): a is Obj => isObj(a) && isStr(a.title) && isStr(a.artist))
          .slice(0, 8)
          .map((a): Song => ({
            title: a.title as string,
            artist: a.artist as string,
            url: isStr(a.url) && SAFE_MUSIC_URL.test(a.url) ? a.url : null,
            track_id: isNum(a.track_id) && Number.isInteger(a.track_id) && a.track_id > 0 ? a.track_id : null,
            trending: asTrend(a.trending),
            source: a.source === "qloo" ? "qloo" : "vibe",
            why: isStr(a.why) ? a.why : null,
          }))
      : [],
  } as Music;
  // A track title without a verified track source is never shown.
  if (music.kind === "track" && (music.track_source !== "itunes" || !isStr(music.title))) throw bad();
  return music;
}

/** Every suggested song (the lead first); empty when there's no verified track. */
export function songsOf(music: Music | null): Song[] {
  if (music?.kind !== "track") return [];
  const lead: Song = {
    title: music.title ?? "", artist: music.artist ?? "", url: music.url, track_id: music.track_id,
    trending: music.trending, source: music.artist_source === "qloo" ? "qloo" : "vibe", why: music.why,
  };
  return [lead, ...music.alternatives];
}

/** This layout's song: layout `index` (its rank) leads, the rest of the list follows. */
export function musicFor(music: Music, index: number): Music {
  const all = songsOf(music);
  if (all.length < 2) return music;
  const k = ((index % all.length) + all.length) % all.length;
  const [head, ...rest] = [...all.slice(k), ...all.slice(0, k)];
  return {
    ...music, title: head!.title, artist: head!.artist, url: head!.url, track_id: head!.track_id,
    trending: head!.trending, artist_source: head!.source, why: head!.why, alternatives: rest,
  };
}

function parseLayouts(v: unknown[]): LayoutSuggestion[] {
  const layouts = v.filter(
    (l): l is LayoutSuggestion =>
      isObj(l) &&
      (TEMPLATE_IDS as readonly unknown[]).includes(l.id) &&
      isStr(l.name) && isStr(l.reason) && isStr(l.headline) && isStr(l.caption) &&
      isStr(l.accent) && HEX.test(l.accent) && isObj(l.score),
  );
  const unit = (n: unknown) => (isNum(n) ? Math.min(1, Math.max(0, n)) : 0.5);
  for (const l of layouts) {
    l.focus_x = unit(l.focus_x);
    l.focus_y = unit(l.focus_y);
    l.filter = (FILTER_IDS as readonly unknown[]).includes(l.filter) ? l.filter : "none";
    l.focuses = Array.isArray(l.focuses)
      ? l.focuses.slice(0, 4).map((f) => ({ x: unit((f as { x?: unknown })?.x), y: unit((f as { y?: unknown })?.y) }))
      : [];
    l.photo_slots = isNum(l.photo_slots) ? Math.max(1, Math.min(4, Math.round(l.photo_slots))) : 1;
    l.likes = isNum(l.likes) ? Math.max(0, Math.round(l.likes)) : 0;
    l.is_new = l.is_new === true;
  }
  return layouts;
}

export function parseAnalysis(v: unknown): Analysis {
  const bad = () => new ApiError("BAD_RESPONSE", "Received an unexpected response.", true);
  if (!isObj(v) || !isObj(v.visual_profile) || !Array.isArray(v.layouts) || !isObj(v.music)) {
    throw bad();
  }
  const vp = v.visual_profile;
  if (!isStrArr(vp.palette) || !vp.palette.every((c) => HEX.test(c)) || !isNum(vp.brightness)) {
    throw bad();
  }
  const layouts = parseLayouts(v.layouts);
  if (!layouts.length) throw bad();
  const music = parseMusic(v.music);
  const recs = Array.isArray(v.cultural_recommendations)
    ? v.cultural_recommendations.filter(
        (r): r is CulturalRecommendation => isObj(r) && isStr(r.name) && r.provider === "qloo",
      )
    : [];
  const ir = v.image_reasoning;
  const image_reasoning: ImageReasoning | null =
    isObj(ir) && isStr(ir.summary) && isStr(ir.model)
      ? {
          provider: "ollama",
          model: ir.model,
          summary: ir.summary,
          moods: isStrArr(ir.moods) ? (ir.moods.filter((m) => (MOODS as readonly string[]).includes(m)) as Mood[]) : [],
          scene: isStrArr(ir.scene) ? ir.scene : [],
          headline_ideas: isStrArr(ir.headline_ideas) ? ir.headline_ideas : [],
          subject: (["person", "people", "object", "scene"] as const).find((k) => k === ir.subject) ?? "scene",
          about: isStr(ir.about) ? ir.about : null,
          elements: isStrArr(ir.elements) ? ir.elements.slice(0, 8) : [],
        }
      : null;
  return {
    ...(v as unknown as Analysis), layouts, music, music_pending: v.music_pending === true,
    locked_layouts: isNum(v.locked_layouts) ? Math.max(0, v.locked_layouts) : 0,
    cultural_recommendations: recs, image_reasoning,
  };
}

export function parseCandidates(v: unknown): TasteCandidate[] {
  if (!isObj(v) || !Array.isArray(v.candidates)) {
    throw new ApiError("BAD_RESPONSE", "Received an unexpected response.", true);
  }
  return v.candidates.filter(
    (c): c is TasteCandidate => isObj(c) && isStr(c.entity_id) && isStr(c.name),
  );
}

async function errorFrom(res: Response): Promise<ApiError> {
  try {
    const body: unknown = await res.json();
    if (isObj(body) && isObj(body.error) && isStr(body.error.message)) {
      return new ApiError(String(body.error.code), body.error.message, Boolean(body.error.retryable));
    }
  } catch {
    /* fall through */
  }
  if (res.status === 429) return new ApiError("RATE_LIMITED", "Too many requests — wait a moment.", true);
  return new ApiError("NETWORK", "The service is unavailable. Please try again.", true);
}

// ---- session ----------------------------------------------------------------------------
let tokenPromise: Promise<string> | null = null;
const TOKEN_KEY = "tasteframe.session";

export function sessionToken(): Promise<string> {
  if (!tokenPromise) {
    tokenPromise = (async () => {
      try {
        const cached = localStorage.getItem(TOKEN_KEY);
        if (cached) return cached;
      } catch {
        /* storage unavailable: fall back to a fresh session */
      }
      const res = await fetch(`${API}/v1/session`, { method: "POST" });
      if (!res.ok) throw await errorFrom(res);
      const body: unknown = await res.json();
      if (!isObj(body) || !isStr(body.session_token)) throw new ApiError("BAD_RESPONSE", "Bad session.");
      try {
        localStorage.setItem(TOKEN_KEY, body.session_token);
      } catch {
        /* ignore */
      }
      return body.session_token;
    })().catch((e) => {
      tokenPromise = null;
      throw e;
    });
  }
  return tokenPromise;
}

async function authed(path: string, init: RequestInit = {}, asUser = false): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("X-Session-Token", await sessionToken());
  // Signed in: always send the account token (favourites, song search, all layouts need it);
  // `asUser` calls need it. The API verifies it with Supabase and RLS enforces it again.
  const token = await accessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  else if (asUser) throw new ApiError("AUTH_REQUIRED", "Log in to save Stories to your account.");
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, { ...init, headers });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError("NETWORK", "Can't reach the server. Check your connection.", true);
  }
  if (res.status === 401) {
    tokenPromise = null;
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  }
  return res;
}

// ---- endpoints --------------------------------------------------------------------------
export async function uploadPhoto(
  file: Blob,
  type: string,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  const res = await authed("/v1/uploads/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content_type: type, size_bytes: file.size }),
    signal,
  });
  if (!res.ok) throw await errorFrom(res);
  const p: unknown = await res.json();
  if (!isObj(p) || !isStr(p.upload_url) || !isObj(p.fields) || !isStr(p.object_key)) {
    throw new ApiError("BAD_RESPONSE", "Received an unexpected response.", true);
  }
  const form = new FormData();
  for (const [k, val] of Object.entries(p.fields)) form.append(k, String(val));
  form.append("file", file);
  // XHR (not fetch) because it reports upload progress.
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", p.upload_url as string);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new ApiError("UPLOAD_FAILED", "Upload failed. Please try again.", true));
    xhr.onerror = () => reject(new ApiError("UPLOAD_FAILED", "Upload failed. Please try again.", true));
    signal?.addEventListener("abort", () => xhr.abort());
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
    xhr.send(form);
  });
  return p.object_key;
}

export async function searchTaste(q: string, type: TasteType, signal?: AbortSignal) {
  const res = await authed(`/v1/taste/search?${new URLSearchParams({ q, type })}`, { signal });
  if (!res.ok) throw await errorFrom(res);
  return parseCandidates(await res.json());
}

export interface AnalysisRequest {
  /** 1–4 uploaded photos for one Story. */
  object_keys: string[];
  taste_seeds: { entity_id: string; entity_type: TasteType; name: string }[];
  manual_mood: Mood[];
  music_language: Language;
}

export async function analyze(
  req: AnalysisRequest,
  onStage: (s: Stage) => void,
  signal?: AbortSignal,
  onMusic?: (m: Music | null) => void,
): Promise<Analysis> {
  const res = await authed("/v1/analysis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...req, locale: "en" }),
    signal,
  });
  if (!res.ok || !res.body) throw await errorFrom(res);
  return readAnalysisStream(res.body, onStage, onMusic);
}

async function* ndjson(body: ReadableStream<Uint8Array>): AsyncGenerator<Obj> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    buf += decoder.decode(value, { stream: !done });
    const lines = buf.split("\n");
    buf = done ? "" : (lines.pop() ?? "");
    for (const line of lines) {
      if (!line.trim()) continue;
      let ev: unknown;
      try {
        ev = JSON.parse(line);
      } catch {
        throw new ApiError("BAD_RESPONSE", "Received an unexpected response.", true);
      }
      if (isObj(ev)) yield ev;
    }
    if (done) return;
  }
}

/**
 * Reads the NDJSON stream: stage events, then the result (resolved right away so layouts show)
 * or a safe error. When songs are still pending, keeps reading and hands the later `{music}`
 * event to `onMusic` (null if it never comes, e.g. the request was cancelled).
 */
export async function readAnalysisStream(
  body: ReadableStream<Uint8Array>,
  onStage: (s: Stage) => void,
  onMusic?: (m: Music | null) => void,
): Promise<Analysis> {
  const events = ndjson(body);
  for (;;) {
    const { value: ev, done } = await events.next();
    if (done) break;
    if (isStr(ev.stage)) onStage(ev.stage as Stage);
    else if (isObj(ev.error)) {
      const e = ev.error;
      throw new ApiError(String(e.code), isStr(e.message) ? e.message : "Analysis failed.", Boolean(e.retryable));
    } else if ("result" in ev) {
      const a = parseAnalysis(ev.result);
      if (a.music_pending) {
        void (async () => {
          let music: Music | null = null;
          try {
            for (let r = await events.next(); !r.done; r = await events.next()) {
              if ("music" in r.value) {
                music = parseMusic(r.value.music);
                break;
              }
            }
          } catch {
            // cancelled or malformed: songs just don't arrive
          }
          onMusic?.(music);
        })();
      }
      return a;
    }
  }
  throw new ApiError("BAD_RESPONSE", "The analysis ended unexpectedly. Please retry.", true);
}

/** Every ranked layout for this analysis (a guest got the top 3); needs a signed-in user. */
export async function moreLayouts(analysisId: string): Promise<LayoutSuggestion[]> {
  const res = await authed(`/v1/analysis/${encodeURIComponent(analysisId)}/layouts`, {}, true);
  if (!res.ok) throw await errorFrom(res);
  const v: unknown = await res.json();
  const layouts = isObj(v) && Array.isArray(v.layouts) ? parseLayouts(v.layouts) : [];
  if (!layouts.length) throw new ApiError("BAD_RESPONSE", "Received an unexpected response.", true);
  return layouts;
}

export async function deleteUpload(objectKey: string): Promise<void> {
  // Keys contain "/" — the API route accepts a path parameter; encode each segment.
  const path = objectKey.split("/").map(encodeURIComponent).join("/");
  const res = await authed(`/v1/uploads/${path}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) throw await errorFrom(res);
}

// ---- features & saved Stories ------------------------------------------------------------
export interface Features {
  qloo: boolean;
  image_reasoning: boolean;
  saved_stories: boolean;
}

export async function getFeatures(): Promise<Features> {
  try {
    const res = await fetch(`${API}/v1/features`);
    const v: unknown = await res.json();
    if (res.ok && isObj(v)) {
      return { qloo: v.qloo === true, image_reasoning: v.image_reasoning === true, saved_stories: v.saved_stories === true };
    }
  } catch {
    /* treat as unavailable */
  }
  return { qloo: false, image_reasoning: false, saved_stories: false };
}

export interface SavedStory {
  id: string;
  config: StoryState;
  created_at: string;
  photo_count: number;
  provenance: { qloo_used: boolean; music_artist: string | null; music_title: string | null };
}

const isLayer = (v: unknown) =>
  isObj(v) && isStr(v.text) && isNum(v.size) && isStr(v.color) && isNum(v.x) && isNum(v.y);

export function parseStoryState(v: unknown): StoryState | null {
  if (!isObj(v) || !(TEMPLATE_IDS as readonly unknown[]).includes(v.templateId)) return null;
  if (!isLayer(v.headline) || !isLayer(v.caption) || !isObj(v.crop) || !isObj(v.overlay)) return null;
  if (!isObj(v.decorations) || !isStr(v.accent) || !isStrArr(v.palette) || !isStr(v.stamp)) return null;
  const { cover, ...rest } = v;
  return { ...rest, cover: isObj(cover) ? { ...DEFAULT_COVER, ...cover, style: normalizeCoverStyle(cover.style) } : { ...DEFAULT_COVER }, tags: isStrArr(v.tags) ? v.tags : [] } as unknown as StoryState;
}

function parseSaved(v: unknown): SavedStory | null {
  if (!isObj(v) || !isStr(v.id) || !isStr(v.created_at)) return null;
  const config = parseStoryState(v.config);
  if (!config) return null;
  const p = isObj(v.provenance) ? v.provenance : {};
  return {
    id: v.id,
    config,
    created_at: v.created_at,
    photo_count: isNum(v.photo_count) ? Math.max(1, Math.min(4, Math.round(v.photo_count))) : 1,
    provenance: {
      qloo_used: p.qloo_used === true,
      music_artist: isStr(p.music_artist) ? p.music_artist : null,
      music_title: isStr(p.music_title) ? p.music_title : null,
    },
  };
}

export async function saveStory(
  objectKeys: string[],
  config: StoryState,
  provenance: SavedStory["provenance"] & { track_source: "itunes" | null },
): Promise<SavedStory> {
  const res = await authed(
    "/v1/stories",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ object_keys: objectKeys, config, provenance }),
    },
    true,
  );
  if (!res.ok) throw await errorFrom(res);
  const saved = parseSaved(await res.json());
  if (!saved) throw new ApiError("BAD_RESPONSE", "Received an unexpected response.", true);
  return saved;
}

export async function listStories(): Promise<SavedStory[]> {
  const res = await authed("/v1/stories", {}, true);
  if (!res.ok) throw await errorFrom(res);
  const v: unknown = await res.json();
  if (!isObj(v) || !Array.isArray(v.stories)) {
    throw new ApiError("BAD_RESPONSE", "Received an unexpected response.", true);
  }
  return v.stories.map(parseSaved).filter((x): x is SavedStory => x !== null);
}

export async function storyPhoto(id: string, index = 0): Promise<Blob> {
  const res = await authed(`/v1/stories/${encodeURIComponent(id)}/photo?index=${index}`, {}, true);
  if (!res.ok) throw await errorFrom(res);
  return res.blob();
}

export async function deleteStory(id: string): Promise<void> {
  const res = await authed(`/v1/stories/${encodeURIComponent(id)}`, { method: "DELETE" }, true);
  if (!res.ok) throw await errorFrom(res);
}

export interface Track {
  track_id: number;
  title: string;
  artist: string;
  album: string | null;
  explicit: boolean;
}

/** Songs matching free text (Apple Music catalogue), for picking a cover. */
export async function searchTracks(q: string, signal?: AbortSignal): Promise<Track[]> {
  const res = await authed(`/v1/music/search?q=${encodeURIComponent(q)}`, { signal });
  if (!res.ok) throw await errorFrom(res);
  const v: unknown = await res.json();
  if (!isObj(v) || !Array.isArray(v.tracks)) throw new ApiError("BAD_RESPONSE", "Received an unexpected response.", true);
  return v.tracks
    .filter((t): t is Record<string, unknown> => isObj(t) && isNum(t.track_id) && isStr(t.title) && isStr(t.artist) && t.has_artwork === true)
    .map((t) => ({ track_id: t.track_id as number, title: t.title as string, artist: t.artist as string, album: isStr(t.album) ? t.album : null, explicit: t.explicit === true }));
}

/** Square cover art for a track, served same-origin by the API (keeps the canvas exportable). */
export async function trackArtwork(trackId: number): Promise<Blob> {
  const res = await authed(`/v1/music/artwork/${trackId}`);
  if (!res.ok) throw await errorFrom(res);
  return res.blob();
}

// ---- Layout requests (Pinterest pins) -------------------------------------------------------
export interface PinPreview {
  pin_id: string;
  pin_url: string;
  title: string | null;
  author: string | null;
  author_url: string | null;
  thumbnail_url: string;
  width: number;
  height: number;
}

const isPin = (v: unknown): v is PinPreview =>
  isObj(v) && isStr(v.pin_id) && isStr(v.pin_url) && isStr(v.thumbnail_url) && v.thumbnail_url.startsWith("https://i.pinimg.com/") && isNum(v.width) && isNum(v.height);

/** Verified preview of a Pinterest pin link (pinterest.com/pin/… or pin.it/…). */
export async function previewPin(url: string, signal?: AbortSignal): Promise<PinPreview> {
  let res: Response;
  try {
    res = await fetch(`${API}/v1/pins/preview?url=${encodeURIComponent(url)}`, { signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError("NETWORK", "Can't reach the server. Check your connection.", true);
  }
  if (!res.ok) throw await errorFrom(res);
  const v: unknown = await res.json();
  if (!isPin(v)) throw new ApiError("BAD_RESPONSE", "Received an unexpected response.", true);
  return v;
}

export async function requestLayout(body: { pin_url: string; note?: string; email?: string; visitor?: string; referrer?: string; device?: string }): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API}/v1/layout-requests`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new ApiError("NETWORK", "Can't reach the server. Check your connection.", true);
  }
  if (!res.ok) throw await errorFrom(res);
}

// ---- Admin -----------------------------------------------------------------------------------
export type RequestStatus = "pending" | "accepted" | "rejected" | "done";
export interface LayoutRequest {
  id: string;
  created_at: string;
  status: RequestStatus;
  pin_id: string;
  pin_url: string;
  pin_title: string | null;
  pin_author: string | null;
  pin_author_url: string | null;
  pin_thumb: string | null;
  pin_width: number | null;
  pin_height: number | null;
  note: string | null;
  email: string | null;
  referrer: string | null;
  device: string | null;
  signed_in: boolean;
  admin_note: string | null;
  reviewed_at: string | null;
}
export interface AdminStats {
  since: string;
  totals: Record<"pageviews" | "visitors" | "analyses" | "layout_opens" | "exports" | "saves" | "requests", number>;
  daily: { day: string; pageviews: number; visitors: number; exports: number }[];
  referrers: { name: string; count: number }[];
  pages: { name: string; count: number }[];
  layouts: { name: string; opens: number; exports: number }[];
  devices: Record<string, number>;
  accounts: Record<"users" | "admins" | "new", number>;
  requests: Record<RequestStatus, number>;
}

export interface AdminUser {
  id: string;
  email: string | null;
  role: "user" | "admin";
  created_at: string;
  last_seen: string | null;
  events: number;
  pageviews: number;
  analyses: number;
  layout_opens: number;
  exports: number;
  saves: number;
  layouts: { name: string; count: number }[];
  suspended: boolean;
}

const STATUSES: RequestStatus[] = ["pending", "accepted", "rejected", "done"];
function parseRequest(v: unknown): LayoutRequest | null {
  if (!isObj(v) || !isStr(v.id) || !isStr(v.pin_url) || !STATUSES.includes(v.status as RequestStatus)) return null;
  const str = (k: string) => (isStr(v[k]) ? (v[k] as string) : null);
  const num = (k: string) => (isNum(v[k]) ? (v[k] as number) : null);
  const thumb = str("pin_thumb");
  const authorUrl = str("pin_author_url");
  return {
    id: v.id,
    created_at: str("created_at") ?? "",
    status: v.status as RequestStatus,
    pin_id: str("pin_id") ?? "",
    pin_url: v.pin_url.startsWith("https://www.pinterest.com/pin/") ? v.pin_url : "https://www.pinterest.com/",
    pin_title: str("pin_title"),
    pin_author: str("pin_author"),
    pin_author_url: authorUrl?.startsWith("https://www.pinterest.com/") ? authorUrl : null,
    pin_thumb: thumb?.startsWith("https://i.pinimg.com/") ? thumb : null,
    pin_width: num("pin_width"),
    pin_height: num("pin_height"),
    note: str("note"),
    email: str("email"),
    referrer: str("referrer"),
    device: str("device"),
    signed_in: v.signed_in === true,
    admin_note: str("admin_note"),
    reviewed_at: str("reviewed_at"),
  };
}

async function adminGet(path: string, init: RequestInit = {}): Promise<unknown> {
  const res = await authed(`/v1/admin${path}`, init, true);
  if (!res.ok) throw await errorFrom(res);
  return res.json();
}

export async function adminMe(): Promise<boolean> {
  const v = await adminGet("/me");
  return isObj(v) && v.admin === true;
}

export async function adminStats(days: number): Promise<AdminStats> {
  const v = await adminGet(`/stats?days=${days}`);
  if (!isObj(v) || !isObj(v.totals)) throw new ApiError("BAD_RESPONSE", "Received an unexpected response.", true);
  const arr = <T,>(x: unknown, ok: (i: Record<string, unknown>) => boolean): T[] => (Array.isArray(x) ? (x.filter((i) => isObj(i) && ok(i)) as T[]) : []);
  return {
    since: isStr(v.since) ? v.since : "",
    totals: v.totals as AdminStats["totals"],
    daily: arr(v.daily, (i) => isStr(i.day)),
    referrers: arr(v.referrers, (i) => isStr(i.name) && isNum(i.count)),
    pages: arr(v.pages, (i) => isStr(i.name) && isNum(i.count)),
    layouts: arr(v.layouts, (i) => isStr(i.name)),
    devices: isObj(v.devices) ? (v.devices as Record<string, number>) : {},
    accounts: (isObj(v.accounts) ? v.accounts : { users: 0, admins: 0, new: 0 }) as AdminStats["accounts"],
    requests: (isObj(v.requests) ? v.requests : { pending: 0, accepted: 0, rejected: 0, done: 0 }) as AdminStats["requests"],
  };
}

export async function adminUsers(days: number): Promise<AdminUser[]> {
  const v = await adminGet(`/users?days=${days}`);
  if (!isObj(v) || !Array.isArray(v.users)) throw new ApiError("BAD_RESPONSE", "Received an unexpected response.", true);
  const n = (x: unknown) => (isNum(x) ? x : 0);
  return v.users.filter((u): u is Record<string, unknown> => isObj(u) && isStr(u.id)).map((u) => ({
    id: u.id as string,
    email: isStr(u.email) ? u.email : null,
    role: u.role === "admin" ? "admin" : "user",
    created_at: isStr(u.created_at) ? u.created_at : "",
    last_seen: isStr(u.last_seen) ? u.last_seen : null,
    events: n(u.events),
    pageviews: n(u.pageviews),
    analyses: n(u.analyses),
    layout_opens: n(u.layout_opens),
    exports: n(u.exports),
    saves: n(u.saves),
    layouts: Array.isArray(u.layouts)
      ? u.layouts.filter((l): l is { name: string; count: number } => isObj(l) && isStr(l.name) && isNum(l.count))
      : [],
    suspended: u.suspended === true,
  }));
}

/** Make an account admin (or back to user) and/or suspend it; returns its new state. */
export async function updateUser(id: string, patch: { role?: "user" | "admin"; suspended?: boolean }): Promise<Pick<AdminUser, "role" | "suspended">> {
  const v = await adminGet(`/users/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!isObj(v)) throw new ApiError("BAD_RESPONSE", "Received an unexpected response.", true);
  return { role: v.role === "admin" ? "admin" : "user", suspended: v.suspended === true };
}

export async function adminRequests(status?: RequestStatus): Promise<LayoutRequest[]> {
  const v = await adminGet(`/requests${status ? `?status=${status}` : ""}`);
  if (!isObj(v) || !Array.isArray(v.requests)) throw new ApiError("BAD_RESPONSE", "Received an unexpected response.", true);
  return v.requests.map(parseRequest).filter((r): r is LayoutRequest => r !== null);
}

export async function updateRequest(id: string, status: RequestStatus, adminNote: string): Promise<LayoutRequest> {
  const v = await adminGet(`/requests/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, admin_note: adminNote || null }),
  });
  const r = parseRequest(v);
  if (!r) throw new ApiError("BAD_RESPONSE", "Received an unexpected response.", true);
  return r;
}

// ---- Layout likes (anonymous or signed in) ---------------------------------------------------
export interface Likes {
  enabled: boolean;
  counts: Partial<Record<TemplateId, number>>;
  liked: TemplateId[];
  fresh: TemplateId[];
  /** ISO date each layout was added. */
  added: Partial<Record<TemplateId, string>>;
}
const isLayout = (x: unknown): x is TemplateId => (TEMPLATE_IDS as readonly unknown[]).includes(x);

/** Sends the account token when signed in (likes then follow the account), else as a guest. */
async function likesFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = await accessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  try {
    return await fetch(`${API}${path}`, { ...init, headers });
  } catch {
    throw new ApiError("NETWORK", "Can't reach the server. Check your connection.", true);
  }
}

export async function getLikes(visitor: string): Promise<Likes> {
  const res = await likesFetch(`/v1/layouts/likes?visitor=${encodeURIComponent(visitor)}`);
  if (!res.ok) throw await errorFrom(res);
  const v: unknown = await res.json();
  if (!isObj(v) || !isObj(v.counts)) throw new ApiError("BAD_RESPONSE", "Received an unexpected response.", true);
  const counts: Likes["counts"] = {};
  for (const [k, n] of Object.entries(v.counts)) if (isLayout(k) && isNum(n)) counts[k] = Math.max(0, Math.round(n));
  return {
    enabled: v.enabled === true,
    counts,
    liked: Array.isArray(v.liked) ? v.liked.filter(isLayout) : [],
    fresh: Array.isArray(v.new) ? v.new.filter(isLayout) : [],
    added: isObj(v.added)
      ? Object.fromEntries(Object.entries(v.added).filter(([k, d]) => isLayout(k) && isStr(d) && /^\d{4}-\d{2}-\d{2}$/.test(d)))
      : {},
  };
}

/** Like/unlike; returns the layout's new like count. */
export async function setLike(id: TemplateId, visitor: string, liked: boolean): Promise<number> {
  const res = await likesFetch(`/v1/layouts/${id}/like`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ visitor, liked }),
  });
  if (!res.ok) throw await errorFrom(res);
  const v: unknown = await res.json();
  if (!isObj(v) || !isNum(v.likes)) throw new ApiError("BAD_RESPONSE", "Received an unexpected response.", true);
  return v.likes;
}

export interface AdminQloo {
  /** Admin switch: off means no Qloo calls for anyone. */
  enabled: boolean;
  /** The API has a Qloo key at all. */
  configured: boolean;
  updated_at: string | null;
  updated_by: string | null;
  /** Monthly credits from the last Qloo response (null until the first call is logged). */
  quota: { limit: number; remaining: number; resets_at: string; seen_at: string } | null;
  daily: { day: string; search: number; insights: number; errors: number }[];
}

export async function adminQloo(days: number): Promise<AdminQloo> {
  const v = await adminGet(`/qloo?days=${days}`);
  if (!isObj(v) || typeof v.enabled !== "boolean") throw new ApiError("BAD_RESPONSE", "Received an unexpected response.", true);
  const n = (x: unknown) => (isNum(x) ? x : 0);
  const q = v.quota;
  return {
    enabled: v.enabled,
    configured: v.configured === true,
    updated_at: isStr(v.updated_at) ? v.updated_at : null,
    updated_by: isStr(v.updated_by) ? v.updated_by : null,
    quota:
      isObj(q) && isNum(q.limit) && isNum(q.remaining) && isStr(q.resets_at) && isStr(q.seen_at)
        ? { limit: q.limit, remaining: q.remaining, resets_at: q.resets_at, seen_at: q.seen_at }
        : null,
    daily: Array.isArray(v.daily)
      ? v.daily.filter((d): d is Record<string, unknown> => isObj(d) && isStr(d.day)).map((d) => ({ day: d.day as string, search: n(d.search), insights: n(d.insights), errors: n(d.errors) }))
      : [],
  };
}

/** Turn Qloo on or off for everyone. */
export async function setQloo(enabled: boolean): Promise<boolean> {
  const v = await adminGet("/qloo", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) });
  if (!isObj(v) || typeof v.enabled !== "boolean") throw new ApiError("BAD_RESPONSE", "Received an unexpected response.", true);
  return v.enabled;
}
