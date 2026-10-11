"use client";

import { toggleLike, useLikes } from "../lib/likes";
import { TEMPLATES } from "../lib/story/templates";
import type { TemplateId } from "../lib/story/types";
import s from "./maker.module.css";

/** Heart + count for a layout; anyone can like (anonymously, or as their account). */
export function LikeButton({ id }: { id: TemplateId }) {
  const likes = useLikes();
  if (!likes.enabled) return null;
  const on = likes.liked.includes(id);
  const n = likes.counts[id] ?? 0;
  const name = TEMPLATES[id].name;
  return (
    <button
      type="button"
      className={`${s.like} ${on ? s.likeOn : ""}`}
      aria-pressed={on}
      aria-label={`${on ? "Unlike" : "Like"} ${name}${n ? ` (${n} ${n === 1 ? "like" : "likes"})` : ""}`}
      onClick={() => void toggleLike(id)}
    >
      <span aria-hidden>{on ? "♥" : "♡"}</span>
      {n > 0 && <span>{n}</span>}
    </button>
  );
}

/** "New" tag for recently added layouts. */
export function NewBadge({ id, isNew }: { id: TemplateId; isNew?: boolean }) {
  const likes = useLikes();
  return isNew || likes.fresh.includes(id) ? <span className={s.newBadge}>New</span> : null;
}
