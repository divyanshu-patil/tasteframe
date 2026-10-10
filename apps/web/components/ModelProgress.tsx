"use client";

import type { Task } from "../lib/story/ml.worker";
import { useModelProgress } from "../lib/story/ml";
import s from "./maker.module.css";

/** A download bar for an on-device model; hidden before it starts and once it's done. */
export function ModelProgress({ task, label, working }: { task: Task; label: string; working: string }) {
  const p = useModelProgress(task);
  if (!p || p.stage === "done") return null;
  const downloading = p.stage === "download" && p.loaded < p.total;
  return (
    <div className={s.modelProgress} role="status" aria-live="polite">
      <span className={s.small}>
        {downloading ? `${label} · ${Math.round((p.loaded / p.total) * 100)}% (first time only)` : working}
      </span>
      {/* No value = indeterminate while the model runs. */}
      <progress max={1} value={downloading ? p.loaded / p.total : undefined} aria-label={label} />
    </div>
  );
}
