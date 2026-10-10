"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type Analysis,
  ApiError,
  type LayoutSuggestion,
  MOODS,
  type Mood,
  type Stage,
  type Features,
  type SavedStory,
  analyze,
  deleteUpload,
  getFeatures,
  saveStory,
  storyPhoto,
  uploadPhoto,
} from "../lib/api";
import { authConfigured, signOut, useAuth } from "../lib/auth";
import { sampleFile } from "../lib/sample";
import { TEMPLATES, defaultState } from "../lib/story/templates";
import { inputFor } from "../lib/story/input";
import type { StoryState, TemplateId } from "../lib/story/types";
import { MAX_BYTES, checkFile } from "../lib/upload";
import { Editor } from "./Editor";
import { LoginDialog } from "./LoginDialog";
import { Progress } from "./Progress";
import { Results } from "./Results";
import { SavedStories } from "./SavedStories";
import { type Seed, TastePicker } from "./TastePicker";
import s from "./maker.module.css";

type Phase = "setup" | "working" | "results" | "edit";

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

export function StoryMaker() {
  const [phase, setPhase] = useState<Phase>("setup");
  // 1–4 photos for one Story (order = upload order; layouts can rearrange them per slot).
  const [photos, setPhotos] = useState<PhotoFile[]>([]);
  const photo = photos[0] ?? null;
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [moods, setMoods] = useState<Mood[]>([]);
  const [seeds, setSeeds] = useState<Seed[]>([]);
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
  const [login, setLogin] = useState<{ reason: string; resolve: (ok: boolean) => void } | null>(null);
  const canSave = Boolean(features?.saved_stories && authConfigured);
  /** Opens the login dialog; resolves true once signed in (false if dismissed). */
  const requestLogin = (reason: string) =>
    new Promise<boolean>((resolve) => setLogin({ reason, resolve }));
  const runId = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
          taste_seeds: seeds.map(({ entity_id, entity_type, name }) => ({
            entity_id,
            entity_type,
            name,
          })),
        },
        (stage) => live() && setProgress((p) => ({ ...p, stage })),
        ctrl.signal,
      );
      if (!live()) return;
      setAnalysis(result);
      setStoryDate(new Date());
      setPhase("results");
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
  };

  /** Provider/API outage must not block creating a Story: continue with local templates. */
  const continueLocally = () => {
    runId.current++;
    setAnalysis(null);
    setStoryDate(new Date());
    setRunError(null);
    setPhase("results");
  };

  const openEditor = (id: TemplateId) => {
    const layout =
      analysis?.layouts.find((l) => l.id === id) ??
      analysis?.layouts[0] ??
      null;
    setStory(defaultState(id, inputFor(layout, analysis, storyDate)));
    setPhase("edit");
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
          hasSeeds={seeds.length > 0}
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
        (photos.length > 1 ? LOCAL_MULTI : LOCAL_SINGLE).map((id) => ({
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
        }));
      return (
        <Results
          photo={photos.map((p) => p.img)}
          analysis={analysis}
          suggestions={suggestions}
          date={storyDate}
          onEdit={openEditor}
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
          suggested={analysis?.layouts.slice(0, 3).map((l) => l.id) ?? (photos.length > 1 ? LOCAL_MULTI : LOCAL_SINGLE).slice(0, 3)}
          music={analysis?.music ?? null}
          onBack={analysis || objectKeys ? () => setPhase("results") : undefined}
          onStartOver={startOver}
          onSave={save}
          signedIn={Boolean(user)}
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
          <p className={s.stepNo}>
            03 — Taste <span className={s.muted}>(optional)</span>
          </p>
          <TastePicker
            seeds={seeds}
            onChange={setSeeds}
            available={features?.qloo !== false}
          />
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
      {canSave && (
        <div className={s.accountBar}>
          {user ? (
            <>
              <span className={s.muted}>Signed in as {user.email}</span>
              <button className={s.linkBtn} onClick={() => void signOut()}>Log out</button>
            </>
          ) : (
            <>
              <span className={s.muted}>Create and download freely — log in to save Stories.</span>
              <button className={s.linkBtn} onClick={() => void requestLogin("Log in to keep your Stories in one place.")}>
                Log in
              </button>
            </>
          )}
        </div>
      )}
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
