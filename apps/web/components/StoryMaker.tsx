"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type Analysis,
  ApiError,
  LANGUAGES,
  type Language,
  type LayoutSuggestion,
  MOODS,
  type Mood,
  type Stage,
  type Features,
  type SavedStory,
  analyze,
  deleteUpload,
  getFeatures,
  moreLayouts,
  saveStory,
  storyPhoto,
  uploadPhoto,
} from "../lib/api";
import { authConfigured, useAuth } from "../lib/auth";
import { sampleFile } from "../lib/sample";
import { TEMPLATES, defaultState } from "../lib/story/templates";
import { inputFor, songFor } from "../lib/story/input";
import { track } from "../lib/analytics";
import { TEMPLATE_IDS, type StoryState, type TemplateId } from "../lib/story/types";
import { MAX_BYTES, checkFile } from "../lib/upload";
import { Editor } from "./Editor";
import { LoginDialog } from "./LoginDialog";
import { Progress } from "./Progress";
import { Results } from "./Results";
import { SavedStories } from "./SavedStories";
import { type Seed, TastePicker } from "./TastePicker";
import s from "./maker.module.css";

type Phase = "setup" | "working" | "results" | "edit";

// Each step has its own URL so Back/Forward, reloads and shared links behave like pages:
//   /create[?layout=preset]  →  /create?step=results  →  /create?step=edit&layout=<id>
// Steps are client state (photos live in memory), so we use the History API, which Next's App
// Router syncs with; a step we can't show (e.g. after a reload, no photos) falls back to setup.
const isTemplate = (v: string | null): v is TemplateId => (TEMPLATE_IDS as readonly string[]).includes(v ?? "");
function urlFor(phase: Phase, layout: TemplateId | null, preset?: TemplateId): string {
  if (phase === "results" || phase === "working") return "/create?step=results";
  if (phase === "edit" && layout) return `/create?step=edit&layout=${layout}`;
  return preset ? `/create?layout=${preset}` : "/create";
}

export interface PhotoFile {
  file: File;
  type: string;
  url: string;
  img: HTMLImageElement;
}

const MAX_PHOTOS = 4;
// Offline fallback order (no analysis): single-photo vs multi-photo friendly layouts first.
const LOCAL_SINGLE: TemplateId[] = ["cinematic", "editorial", "scrapbook", "vintage", "journal", "minimal"];
const LOCAL_MULTI: TemplateId[] = ["grid", "polaroids", "booth", "duo", "splitscreen", "mosaic"];

async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

export function StoryMaker({ preset }: { preset?: TemplateId } = {}) {
  const [phase, setPhase] = useState<Phase>("setup");
  // 1–4 photos for one Story (order = upload order; layouts can rearrange them per slot).
  const [photos, setPhotos] = useState<PhotoFile[]>([]);
  const photo = photos[0] ?? null;
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [moods, setMoods] = useState<Mood[]>([]);
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [language, setLanguage] = useState<Language>("en");
  const [progress, setProgress] = useState<{
    upload: number;
    stage: Stage | null;
  }>({ upload: 0, stage: null });
  const [runError, setRunError] = useState<ApiError | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  // Uploaded keys, aligned with `photos`; null when the current photos aren't uploaded yet.
  const [objectKeys, setObjectKeys] = useState<string[] | null>(null);
  const [story, setStory] = useState<StoryState | null>(null);
  const [storyDate, setStoryDate] = useState(() => new Date());
  const [features, setFeatures] = useState<Features | null>(null);
  const [savedVersion, setSavedVersion] = useState(0); // bump to refresh the saved list
  const { user } = useAuth();
  // With accounts configured, guests get the top 3 layouts as-is; favourites, shuffling, other
  // layouts and any edit need an account. Songs never do.
  const guest = authConfigured && !user;
  const [login, setLogin] = useState<{ reason: string; resolve: (ok: boolean) => void } | null>(null);
  const canSave = Boolean(features?.saved_stories && authConfigured);
  /** Opens the login dialog; resolves true once signed in (false if dismissed). */
  const requestLogin = (reason: string) =>
    new Promise<boolean>((resolve) => setLogin({ reason, resolve }));
  const localIds = photos.length > 1 ? LOCAL_MULTI : LOCAL_SINGLE;
  /** The top 3 suggestions: the layouts a guest can use. */
  const freeIds = (a: Analysis | null) => (a ? a.layouts.slice(0, 3).map((l) => l.id) : localIds.slice(0, 3));
  /** Guests log in first (false if they don't); a guest-run analysis then fetches the layouts the API held back. */
  const unlock = async (reason: string, a = analysis): Promise<Analysis | null | false> => {
    if (guest && !(await requestLogin(reason))) return false;
    if (!a?.locked_layouts) return a;
    const layouts = await moreLayouts(a.analysis_id);
    setAnalysis((cur) => (cur?.analysis_id === a.analysis_id ? { ...cur, layouts, locked_layouts: 0 } : cur));
    return { ...a, layouts, locked_layouts: 0 };
  };
  const runId = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /** Point the address bar at a step: push a history entry, or replace the current one. */
  const nav = (to: Phase, layout: TemplateId | null = null, how: "push" | "replace" = "push", extra: object = {}) => {
    const url = urlFor(to, layout, preset);
    if (url === location.pathname + location.search && how === "push") return;
    if (how === "push") history.pushState({ tf: to, ...extra }, "", url);
    else history.replaceState({ ...(history.state as object | null), tf: to }, "", url);
  };

  // Back / Forward between steps.
  useEffect(() => {
    const onPop = () => {
      const q = new URLSearchParams(location.search);
      const step = q.get("step");
      const layout = q.get("layout");
      if (step === "results" && photos.length) return setPhase((p) => (p === "working" ? p : "results"));
      if (step === "edit" && photos.length && isTemplate(layout)) {
        setStory((cur) => cur?.templateId === layout ? cur : defaultState(layout, inputFor(analysis?.layouts.find((l) => l.id === layout) ?? analysis?.layouts[0] ?? null, analysis, storyDate)));
        return setPhase("edit");
      }
      abort.current?.abort(); // leaving a running analysis cancels it
      runId.current++;
      setPhase("setup");
      if (step) nav("setup", null, "replace");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nav only reads preset
  }, [photos, analysis, storyDate, preset]);

  // A reload loses the in-memory photos: show setup at a URL that matches it.
  useEffect(() => {
    if (new URLSearchParams(location.search).get("step")) nav("setup", null, "replace");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, []);

  // Switching layouts inside the editor keeps the address bar in step (no extra history).
  useEffect(() => {
    if (phase === "edit" && story) nav("edit", story.templateId, "replace");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, story?.templateId]);

  const rootRef = useRef<HTMLDivElement>(null);
  // Bring the new step into view (the landing hero sits above the workspace).
  useEffect(() => {
    if (phase !== "setup")
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [phase]);

  useEffect(() => {
    void getFeatures().then(setFeatures);
  }, []);

  // Revoke preview object URLs when the page unmounts (removals revoke their own).
  const urls = useRef<string[]>([]);
  urls.current = photos.map((p) => p.url);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const cleanupUploads = useCallback((keys: string[] | null) => {
    // Best effort; the bucket lifecycle rule expires temporary uploads anyway.
    for (const k of keys ?? []) deleteUpload(k).catch(() => undefined);
  }, []);

  /** Any change to the photo set invalidates uploads and results derived from them. */
  const invalidate = () => {
    cleanupUploads(objectKeys);
    setObjectKeys(null);
    setAnalysis(null);
  };

  const choose = async (files: File[] | FileList | undefined | null) => {
    const list = Array.from(files ?? []);
    if (!list.length) return;
    setFileError(null);
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) return setFileError(`Up to ${MAX_PHOTOS} photos per Story.`);
    const added: PhotoFile[] = [];
    for (const file of list.slice(0, room)) {
      const check = await checkFile(file);
      if (!check.ok) {
        setFileError(`${file.name}: ${check.error}`);
        continue;
      }
      const url = URL.createObjectURL(file);
      try {
        added.push({ file, type: check.type, url, img: await loadImage(url) });
      } catch {
        URL.revokeObjectURL(url);
        setFileError(`${file.name} could not be decoded. Try another photo.`);
      }
    }
    if (list.length > room) setFileError(`Only ${MAX_PHOTOS} photos per Story — extra ones were skipped.`);
    if (!added.length) return;
    invalidate();
    setPhotos((cur) => [...cur, ...added].slice(0, MAX_PHOTOS));
  };

  /** Editor: add photos to fill empty slots of a multi-photo layout (no re-analysis). */
  const addPhotosLater = async (files: FileList | null) => {
    const list = Array.from(files ?? []).slice(0, MAX_PHOTOS - photos.length);
    const added: PhotoFile[] = [];
    for (const file of list) {
      const check = await checkFile(file);
      if (!check.ok) throw new ApiError("INVALID_IMAGE", `${file.name}: ${check.error}`);
      const url = URL.createObjectURL(file);
      try {
        added.push({ file, type: check.type, url, img: await loadImage(url) });
      } catch {
        URL.revokeObjectURL(url);
        throw new ApiError("INVALID_IMAGE", `${file.name} could not be decoded.`);
      }
    }
    if (!added.length) return;
    // Upload now so "Save to my Stories" includes them (keys stay aligned with photos).
    if (objectKeys) {
      const keys: string[] = [];
      for (const p of added) keys.push(await uploadPhoto(p.file, p.type, () => undefined));
      setObjectKeys((cur) => (cur ? [...cur, ...keys] : cur));
    }
    setPhotos((cur) => [...cur, ...added].slice(0, MAX_PHOTOS));
  };

  const removeOne = (i: number) => {
    const p = photos[i];
    if (p) URL.revokeObjectURL(p.url);
    invalidate();
    setPhotos((cur) => cur.filter((_, k) => k !== i));
  };

  const removePhoto = () => {
    abort.current?.abort();
    runId.current++;
    cleanupUploads(objectKeys);
    setObjectKeys(null);
    photos.forEach((p) => URL.revokeObjectURL(p.url));
    setPhotos([]);
    setAnalysis(null);
    setStory(null);
    setPhase("setup");
    nav("setup");
  };

  const generate = async () => {
    if (!photos.length) return;
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    const id = ++runId.current;
    const live = () => id === runId.current; // stale runs never overwrite newer results
    setRunError(null);
    setProgress({ upload: 0, stage: null });
    setPhase("working");
    nav("results");
    try {
      let keys = objectKeys;
      if (!keys) {
        keys = [];
        for (const [i, ph] of photos.entries()) {
          const k = await uploadPhoto(
            ph.file,
            ph.type,
            (f) => live() && setProgress((p) => ({ ...p, upload: (i + f) / photos.length })),
            ctrl.signal,
          );
          if (!live()) return;
          keys.push(k);
        }
        setObjectKeys(keys);
      }
      setProgress((p) => ({ ...p, upload: 1 }));
      const result = await analyze(
        {
          object_keys: keys,
          manual_mood: moods,
          music_language: language,
          taste_seeds: (guest ? [] : seeds).map(({ entity_id, entity_type, name }) => ({
            entity_id,
            entity_type,
            name,
          })),
        },
        (stage) => live() && setProgress((p) => ({ ...p, stage })),
        ctrl.signal,
        // Songs follow the layouts: fill them in when they arrive (or show none if they don't).
        (music) =>
          live() &&
          setAnalysis((cur) =>
            cur
              ? { ...cur, music_pending: false, music: music ?? { ...cur.music, explanation: "Couldn't pick songs right now." } }
              : cur,
          ),
      );
      if (!live()) return;
      setAnalysis(result);
      track("analysis");
      const date = new Date();
      setStoryDate(date);
      if (preset && guest && !freeIds(result).includes(preset)) {
        // Not one of this photo's free three: show them, then ask to log in for this one.
        setPhase("results");
        void openEditor(preset, result);
      } else if (preset) {
        track("layout_open", { layout: preset });
        // Picked from the gallery: go straight to that layout, personalised by the analysis.
        const layout = result.layouts.find((l) => l.id === preset) ?? result.layouts[0] ?? null;
        setStory(defaultState(preset, inputFor(layout, result, date)));
        setPhase("edit");
        nav("edit", preset, "replace");
      } else setPhase("results");
    } catch (e) {
      if (!live() || (e as Error).name === "AbortError") return;
      if (
        e instanceof ApiError &&
        (e.code === "OBJECT_NOT_FOUND" || e.code === "SESSION_INVALID")
      ) {
        setObjectKeys(null); // re-upload on retry
      }
      setRunError(
        e instanceof ApiError
          ? e
          : new ApiError("INTERNAL", "Something went wrong.", true),
      );
    }
  };

  const cancel = () => {
    abort.current?.abort();
    runId.current++;
    setPhase("setup");
    // Undo the "results" entry generate() pushed, so Back doesn't land on it again.
    if ((history.state as { tf?: string } | null)?.tf === "results") history.back();
    else nav("setup", null, "replace");
  };

  /** Provider/API outage must not block creating a Story: continue with local templates. */
  const continueLocally = () => {
    runId.current++;
    setAnalysis(null);
    const date = new Date();
    setStoryDate(date);
    setRunError(null);
    if (preset && guest && !freeIds(null).includes(preset)) {
      setPhase("results");
      void openEditor(preset, null);
    } else if (preset) {
      setStory(defaultState(preset, inputFor(null, null, date)));
      setPhase("edit");
      nav("edit", preset, "replace");
    } else setPhase("results");
  };

  const openEditor = async (id: TemplateId, a = analysis) => {
    if (!freeIds(a).includes(id) && (guest || a?.locked_layouts)) {
      // If the held-back layouts can't be fetched (expired), still open it, less personalised.
      const r = await unlock(`Log in to use the ${TEMPLATES[id].name} layout — the three suggested for your photo are free.`, a).catch(() => a);
      if (r === false) return;
      a = r;
    }
    const layout = a?.layouts.find((l) => l.id === id) ?? a?.layouts[0] ?? null;
    setStory(defaultState(id, inputFor(layout, a, storyDate)));
    track("layout_open", { layout: id });
    setPhase("edit");
    nav("edit", id, "push", { from: "results" });
  };

  const startOver = () => {
    removePhoto();
    setMoods([]);
    setSeeds([]);
  };

  /** Re-open a saved Story: photos come back through the API (same-origin, canvas-safe). */
  const openSaved = async (saved: SavedStory) => {
    const loaded: PhotoFile[] = [];
    try {
      for (let i = 0; i < Math.max(1, saved.photo_count); i++) {
        const blob = await storyPhoto(saved.id, i);
        const file = new File([blob], `saved-${saved.config.templateId}-${i + 1}`, { type: blob.type });
        const url = URL.createObjectURL(file);
        loaded.push({ file, type: blob.type, url, img: await loadImage(url) });
      }
    } catch (e) {
      loaded.forEach((p) => URL.revokeObjectURL(p.url));
      throw e;
    }
    runId.current++;
    cleanupUploads(objectKeys);
    setObjectKeys(null);
    setAnalysis(null);
    photos.forEach((p) => URL.revokeObjectURL(p.url));
    setPhotos(loaded);
    setStory(saved.config);
    setPhase("edit");
    nav("edit", saved.config.templateId);
  };

  const save =
    canSave && objectKeys && story
      ? async () => {
          // Saving to our backend needs an account: ask the guest to log in, then continue.
          if (!user && !(await requestLogin("Log in to save this Story to your account — creating and downloading never need one."))) {
            throw new ApiError("LOGIN_CANCELLED", "");
          }
          const m = analysis?.music;
          await saveStory(objectKeys, story, {
            qloo_used: analysis?.provenance.qloo_used ?? false,
            music_artist: m?.artist ?? null,
            music_title: m?.kind === "track" ? m.title : null,
            track_source: m?.kind === "track" ? m.track_source : null,
          });
          setSavedVersion((v) => v + 1);
        }
      : undefined;

  const toggleMood = (m: Mood) =>
    setMoods((cur) =>
      cur.includes(m)
        ? cur.filter((x) => x !== m)
        : cur.length < 4
          ? [...cur, m]
          : cur,
    );

  const view = (() => {
    if (phase === "working") {
      return (
        <Progress
          upload={progress.upload}
          stage={progress.stage}
          error={runError}
          onRetry={generate}
          onCancel={cancel}
          onLocal={continueLocally}
        />
      );
    }

    if (phase === "results" && photo) {
      const suggestions: LayoutSuggestion[] =
        analysis?.layouts ??
        localIds.map((id) => ({
          id,
          name: TEMPLATES[id].name,
          reason: "Local default — personalised analysis was unavailable.",
          style_tags: [],
          score: {
            visual_fit: 0,
            cultural_style_fit: 0,
            readability_fit: 0,
            total: 0,
          },
          headline: "today, in frames.",
          caption: "",
          accent: "#c03f13",
          focus_x: 0.5,
          focus_y: 0.5,
          filter: "none" as const,
          focuses: [],
          photo_slots: Math.min(photos.length, 4),
          likes: 0,
          is_new: false,
        }));
      return (
        <Results
          photo={photos.map((p) => p.img)}
          analysis={analysis}
          suggestions={suggestions}
          date={storyDate}
          onEdit={(id) => void openEditor(id)}
          onUnlock={
            guest || analysis?.locked_layouts
              ? () => unlock("Log in to shuffle through every layout — the first three are free.").then((r) => r !== false)
              : undefined
          }
          onStartOver={startOver}
          onRetry={analysis ? undefined : generate}
        />
      );
    }

    if (phase === "edit" && photo && story) {
      const layout =
        analysis?.layouts.find((l) => l.id === story.templateId) ??
        analysis?.layouts[0] ??
        null;
      return (
        <Editor
          photos={photos.map((p) => p.img)}
          onAddPhotos={photos.length < MAX_PHOTOS ? addPhotosLater : undefined}
          story={story}
          setStory={setStory}
          input={(id) =>
            inputFor(
              analysis?.layouts.find((l) => l.id === id) ?? layout,
              analysis,
              storyDate,
            )
          }
          suggested={freeIds(analysis)}
          onEditLogin={guest ? (reason) => unlock(reason).then((r) => r !== false, () => true) : undefined}
          music={songFor(analysis?.layouts.find((l) => l.id === story.templateId) ?? null, analysis)}
          musicPending={analysis?.music_pending ?? false}
          musicOff={analysis?.provenance.music_off === true}
          onBack={
            analysis || objectKeys
              ? () => {
                  // Opened from the suggestions: same as the browser's Back button.
                  if ((history.state as { from?: string } | null)?.from === "results") return history.back();
                  setPhase("results");
                  nav("results");
                }
              : undefined
          }
          onStartOver={startOver}
          onSave={save}
          signedIn={Boolean(user)}
          onSongLogin={
            guest
              ? () => requestLogin("Log in to pick a different song — your suggested song is already on the Story.")
              : undefined
          }
        />
      );
    }

    return (
      <section className={s.setup} aria-labelledby="setup-title">
        <h2 id="setup-title" className={s.srOnly}>
          Create your Stories
        </h2>

        {canSave && user && (
          <SavedStories key={`${user.id}:${savedVersion}`} onOpen={openSaved} />
        )}

        {preset && (
          <p className={s.notice} role="status">
            Layout chosen: <strong>{TEMPLATES[preset].name}</strong>
            {(TEMPLATES[preset].capacity ?? 1) > 1 ? ` (holds up to ${TEMPLATES[preset].capacity} photos)` : ""}. Add your photo
            and it opens straight in this layout. <a className={s.linkBtn} href="/gallery">Pick another</a>
          </p>
        )}

        <div className={s.step}>
          <p className={s.stepNo}>
            01 — Photos <span className={s.muted}>(1–{MAX_PHOTOS})</span>
          </p>
          {photos.length > 0 ? (
            <>
              <ul className={s.photoGrid} aria-label="Selected photos">
                {photos.map((p, i) => (
                  <li key={p.url} className={s.photoTile}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
                    <img src={p.url} alt={`Photo ${i + 1}`} className={s.previewImg} />
                    <span className={s.photoNo}>{i + 1}</span>
                    <button className={s.photoRemove} aria-label={`Remove photo ${i + 1}`} onClick={() => removeOne(i)}>
                      ×
                    </button>
                  </li>
                ))}
                {photos.length < MAX_PHOTOS && (
                  <li>
                    <button className={s.photoAdd} onClick={() => inputRef.current?.click()}>
                      + Add photo
                    </button>
                  </li>
                )}
              </ul>
              <p className={s.muted}>
                {photos.length === 1
                  ? "Add up to 3 more for collage layouts — Grid, Photo Booth, Polaroid Pile, Split and more."
                  : `${photos.length} photos — we'll suggest layouts that show all of them. Drag them between slots in the editor.`}
              </p>
            </>
          ) : (
            <label
              htmlFor="photo-input"
              className={`${s.drop} ${dragOver ? s.dropActive : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                void choose(e.dataTransfer.files);
              }}
            >
              <span className={s.dropTitle}>Drop up to 4 photos</span>
              <span className={s.muted}>
                or click to choose · JPG / JPEG, PNG or WebP · up to {Math.round(MAX_BYTES / 1048576)} MB each
              </span>
              <span className={s.primaryFake}>Choose photos</span>
            </label>
          )}
          <input
            ref={inputRef}
            id="photo-input"
            type="file"
            multiple
            accept="image/jpeg,image/jpg,image/pjpeg,image/png,image/webp,.jpg,.jpeg,.jpe,.jfif,.png,.webp"
            className={s.srOnly}
            onChange={(e) => {
              void choose(e.target.files);
              e.target.value = "";
            }}
            aria-label="Choose photos"
          />
          {!photo && (
            <button className={s.linkBtn} onClick={() => void sampleFile().then((f) => choose([f]))}>
              No photo handy? Use a sample dusk landscape.
            </button>
          )}
          {fileError && (
            <p role="alert" className={s.error}>
              {fileError}
            </p>
          )}
        </div>

        <div className={s.step}>
          <p className={s.stepNo}>
            02 — Mood <span className={s.muted}>(optional)</span>
          </p>
          <p className={s.muted}>
            We read colour, light and framing from your photo. Pick up to four
            words to steer it.
            {features?.image_reasoning && (
              <>
                {" "}An AI vision model (Gemma via Ollama Cloud) also looks at a
                downscaled copy to suggest moods and headlines. It never identifies
                people, and Ollama doesn&apos;t train on it.
              </>
            )}
          </p>
          <div className={s.chips} role="group" aria-label="Mood">
            {MOODS.map((m) => (
              <button
                key={m}
                className={`${s.chip} ${moods.includes(m) ? s.chipOn : ""}`}
                aria-pressed={moods.includes(m)}
                onClick={() => toggleMood(m)}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className={s.step}>
          <p className={s.stepNo}>03 — Music</p>
          <p className={s.muted}>
            We suggest a song from your photo&apos;s vibe — baddie, aesthetic, cute, chill… — read
            from your pose, expression and colours. Pick the language you want songs in.
          </p>
          <label className={s.srOnly} htmlFor="song-lang">Song language</label>
          <select
            id="song-lang"
            className={s.select}
            value={language}
            onChange={(e) => setLanguage(e.target.value as Language)}
          >
            {LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </div>

        <div className={s.step}>
          <p className={s.stepNo}>
            04 — Favourite artists <span className={s.muted}>(optional{guest ? " · log in" : ""})</span>
          </p>
          {guest ? (
            <p className={s.muted}>
              Add favourite artists, films or brands and Qloo blends your taste into the song pick.{" "}
              <button className={s.linkBtn} onClick={() => void requestLogin("Log in to add favourite artists — song suggestions work without an account.")}>
                Log in to add favourites
              </button>
            </p>
          ) : (
            <TastePicker
              seeds={seeds}
              onChange={setSeeds}
              available={features?.qloo !== false}
            />
          )}
        </div>

        <div className={s.ctaRow}>
          <button className={s.primary} disabled={!photo} onClick={generate}>
            Create my Stories
          </button>
          {!photo && <span className={s.muted}>Add a photo to continue.</span>}
        </div>
      </section>
    );
  })();

  return (
    <div ref={rootRef} style={{ scrollMarginTop: 16 }}>
      {view}
      <LoginDialog
        open={login !== null}
        reason={login?.reason ?? ""}
        onDone={(ok) => {
          login?.resolve(ok);
          setLogin(null);
        }}
      />
    </div>
  );
}
