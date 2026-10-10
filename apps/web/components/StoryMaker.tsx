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
import { sampleFile } from "../lib/sample";
import { defaultState } from "../lib/story/templates";
import { inputFor } from "../lib/story/input";
import type { StoryState, TemplateId } from "../lib/story/types";
import { MAX_BYTES, checkFile } from "../lib/upload";
import { Editor } from "./Editor";
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

const LOCAL_LAYOUTS: TemplateId[] = ["cinematic", "editorial", "scrapbook"];

async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

export function StoryMaker() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [photo, setPhoto] = useState<PhotoFile | null>(null);
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
  const [objectKey, setObjectKey] = useState<string | null>(null);
  const [story, setStory] = useState<StoryState | null>(null);
  const [storyDate, setStoryDate] = useState(() => new Date());
  const [features, setFeatures] = useState<Features | null>(null);
  const [savedVersion, setSavedVersion] = useState(0); // bump to refresh the saved list
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

  // Revoke the preview object URL whenever the photo changes or the page unmounts.
  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo.url);
    },
    [photo],
  );

  const cleanupUpload = useCallback((key: string | null) => {
    if (key) deleteUpload(key).catch(() => undefined); // best effort; lifecycle rule expires it anyway
  }, []);

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setFileError(null);
    const check = await checkFile(file);
    if (!check.ok) return setFileError(check.error);
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      // A replaced photo invalidates the previous upload and any results derived from it.
      cleanupUpload(objectKey);
      setObjectKey(null);
      setAnalysis(null);
      setPhoto({ file, type: check.type, url, img });
    } catch {
      URL.revokeObjectURL(url);
      setFileError("That image could not be decoded. Try another photo.");
    }
  };

  const removePhoto = () => {
    abort.current?.abort();
    runId.current++;
    cleanupUpload(objectKey);
    setObjectKey(null);
    setPhoto(null);
    setAnalysis(null);
    setStory(null);
    setPhase("setup");
  };

  const generate = async () => {
    if (!photo) return;
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    const id = ++runId.current;
    const live = () => id === runId.current; // stale runs never overwrite newer results
    setRunError(null);
    setProgress({ upload: 0, stage: null });
    setPhase("working");
    try {
      let key = objectKey;
      if (!key) {
        key = await uploadPhoto(
          photo.file,
          photo.type,
          (f) => live() && setProgress((p) => ({ ...p, upload: f })),
          ctrl.signal,
        );
        if (!live()) return;
        setObjectKey(key);
      }
      setProgress((p) => ({ ...p, upload: 1 }));
      const result = await analyze(
        {
          object_key: key,
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
        setObjectKey(null); // re-upload on retry
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

  /** Re-open a saved Story: photo comes back through the API (same-origin, canvas-safe). */
  const openSaved = async (saved: SavedStory) => {
    const blob = await storyPhoto(saved.id);
    const file = new File([blob], `saved-${saved.config.templateId}`, { type: blob.type });
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      runId.current++;
      cleanupUpload(objectKey);
      setObjectKey(null);
      setAnalysis(null);
      setPhoto({ file, type: blob.type, url, img });
      setStory(saved.config);
      setPhase("edit");
    } catch (e) {
      URL.revokeObjectURL(url);
      throw e;
    }
  };

  const save =
    features?.saved_stories && objectKey && story
      ? async () => {
          const m = analysis?.music;
          await saveStory(objectKey, story, {
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
        LOCAL_LAYOUTS.map((id) => ({
          id,
          name: id[0]!.toUpperCase() + id.slice(1),
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
        }));
      return (
        <Results
          photo={photo.img}
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
          photo={photo.img}
          story={story}
          setStory={setStory}
          input={(id) =>
            inputFor(
              analysis?.layouts.find((l) => l.id === id) ?? layout,
              analysis,
              storyDate,
            )
          }
          suggested={analysis?.layouts.map((l) => l.id) ?? LOCAL_LAYOUTS}
          music={analysis?.music ?? null}
          onBack={analysis || objectKey ? () => setPhase("results") : undefined}
          onStartOver={startOver}
          onSave={save}
        />
      );
    }

    return (
      <section className={s.setup} aria-labelledby="setup-title">
        <h2 id="setup-title" className={s.srOnly}>
          Create your Stories
        </h2>

        {features?.saved_stories && (
          <SavedStories key={savedVersion} onOpen={openSaved} />
        )}

        <div className={s.step}>
          <p className={s.stepNo}>01 — Photo</p>
          {photo ? (
            <div className={s.previewRow}>
              {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
              <img
                src={photo.url}
                alt="Your selected photo"
                className={s.previewImg}
              />
              <div className={s.previewMeta}>
                <p className={s.fileName}>{photo.file.name}</p>
                <p className={s.muted}>
                  {photo.img.naturalWidth}×{photo.img.naturalHeight} ·{" "}
                  {(photo.file.size / 1048576).toFixed(1)} MB
                </p>
                <div className={s.row}>
                  <button
                    className={s.secondary}
                    onClick={() => inputRef.current?.click()}
                  >
                    Replace
                  </button>
                  <button className={s.linkBtn} onClick={removePhoto}>
                    Remove
                  </button>
                </div>
              </div>
            </div>
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
                void choose(e.dataTransfer.files[0]);
              }}
            >
              <span className={s.dropTitle}>Drop a photo here</span>
              <span className={s.muted}>
                or click to choose · JPEG, PNG or WebP · up to{" "}
                {Math.round(MAX_BYTES / 1048576)} MB
              </span>
              <span className={s.primaryFake}>Choose photo</span>
            </label>
          )}
          <input
            ref={inputRef}
            id="photo-input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className={s.srOnly}
            onChange={(e) => {
              void choose(e.target.files?.[0]);
              e.target.value = "";
            }}
            aria-label="Choose a photo"
          />
          {!photo && (
            <button
              className={s.linkBtn}
              onClick={() => void sampleFile().then(choose)}
            >
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
      {view}
    </div>
  );
}
