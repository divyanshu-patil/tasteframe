"use client";

import type { ApiError, Stage } from "../lib/api";
import s from "./maker.module.css";

const STEPS: { id: Stage; label: string }[] = [
  { id: "photo", label: "Reading your photo" },
  { id: "mood", label: "Understanding your visual mood" },
  { id: "taste", label: "Matching music to your vibe" },
  { id: "layouts", label: "Creating your Story options" },
];

interface Props {
  upload: number;
  stage: Stage | null;
  error: ApiError | null;
  onRetry: () => void;
  onCancel: () => void;
  onLocal: () => void;
}

/** Every row reflects a real event: upload bytes, then stage events streamed by the API. */
export function Progress({ upload, stage, error, onRetry, onCancel, onLocal }: Props) {
  const current = stage ? STEPS.findIndex((x) => x.id === stage) : -1;
  return (
    <section className={s.progress} aria-live="polite" aria-busy={!error}>
      <h2 className={s.sectionTitle}>Making your Stories</h2>
      <ol className={s.steps}>
        <li className={upload >= 1 ? s.done : s.active}>
          <span>Uploading privately</span>
          <span className={s.mono}>{Math.round(upload * 100)}%</span>
        </li>
        {STEPS.map((step, i) => {
          const status = i < current ? s.done : i === current ? s.active : s.pending;
          return (
            <li key={step.id} className={status}>
              <span>{step.label}</span>
              <span className={s.mono}>{i < current ? "done" : i === current ? "…" : ""}</span>
            </li>
          );
        })}
      </ol>
      {error ? (
        <div role="alert" className={s.errorBox}>
          <p>{error.message}</p>
          <div className={s.row}>
            {error.retryable && <button className={s.primary} onClick={onRetry}>Try again</button>}
            <button className={s.secondary} onClick={onLocal}>Continue with standard layouts</button>
            <button className={s.linkBtn} onClick={onCancel}>Back</button>
          </div>
        </div>
      ) : (
        <button className={s.linkBtn} onClick={onCancel}>Cancel</button>
      )}
    </section>
  );
}
