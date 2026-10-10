"use client";

import { useEffect, useState } from "react";
import { ApiError, type SavedStory, deleteStory, listStories } from "../lib/api";
import { TEMPLATES } from "../lib/story/templates";
import s from "./maker.module.css";

type State =
  | { kind: "loading" }
  | { kind: "error"; msg: string }
  | { kind: "ready"; stories: SavedStory[] };

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

/** Stories this browser saved (guest session). Only shown when persistence is configured. */
export function SavedStories({ onOpen }: { onOpen: (story: SavedStory) => Promise<void> }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busy, setBusy] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const load = () => {
    setState({ kind: "loading" });
    listStories()
      .then((stories) => setState({ kind: "ready", stories }))
      .catch((e: unknown) =>
        setState({ kind: "error", msg: e instanceof ApiError ? e.message : "Couldn't load saved Stories." }),
      );
  };
  useEffect(load, []);

  const act = async (id: string, fn: () => Promise<void>) => {
    setBusy(id);
    setRowError(null);
    try {
      await fn();
    } catch (e) {
      setRowError(e instanceof ApiError ? e.message : "That didn't work. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  if (state.kind === "ready" && state.stories.length === 0) return null; // nothing to show yet

  return (
    <div className={s.step} aria-live="polite">
      <p className={s.stepNo}>Your saved Stories</p>
      {state.kind === "loading" && <p className={s.muted}>Loading…</p>}
      {state.kind === "error" && (
        <p className={s.error}>
          {state.msg} <button className={s.linkBtn} onClick={load}>Retry</button>
        </p>
      )}
      {state.kind === "ready" && (
        <ul className={s.savedList}>
          {state.stories.map((st) => (
            <li key={st.id}>
              <span className={s.savedName}>
                <strong>{st.config.headline.text || "Untitled"}</strong>
                <span className={s.muted}>
                  {TEMPLATES[st.config.templateId].name} · saved {fmt(st.created_at)}
                  {st.expires_at && ` · deleted after ${fmt(st.expires_at)}`}
                </span>
              </span>
              <span className={s.row}>
                <button className={s.secondary} disabled={busy !== null} onClick={() => act(st.id, () => onOpen(st))}>
                  {busy === st.id ? "Opening…" : "Open"}
                </button>
                <button
                  className={s.linkBtn}
                  disabled={busy !== null}
                  onClick={() =>
                    act(st.id, async () => {
                      await deleteStory(st.id);
                      setState({ kind: "ready", stories: state.stories.filter((x) => x.id !== st.id) });
                    })
                  }
                >
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {rowError && <p className={s.error}>{rowError}</p>}
    </div>
  );
}
