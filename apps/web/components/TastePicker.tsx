"use client";

import { useRef, useState } from "react";
import { ApiError, type TasteCandidate, type TasteType, searchTaste } from "../lib/api";
import s from "./maker.module.css";

export type Seed = TasteCandidate;

const TYPES: { id: TasteType; label: string }[] = [
  { id: "artist", label: "Artist" },
  { id: "movie", label: "Film" },
  { id: "tv_show", label: "TV show" },
  { id: "brand", label: "Brand" },
  { id: "book", label: "Book" },
  { id: "podcast", label: "Podcast" },
];
const MAX_SEEDS = 5;

export function TastePicker({ seeds, onChange }: { seeds: Seed[]; onChange: (s: Seed[]) => void }) {
  const [type, setType] = useState<TasteType>("artist");
  const [q, setQ] = useState("");
  const [state, setState] = useState<
    { kind: "idle" } | { kind: "loading" } | { kind: "error"; msg: string } | { kind: "done"; results: TasteCandidate[] }
  >({ kind: "idle" });
  const ctrl = useRef<AbortController | null>(null);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = q.trim();
    if (query.length < 2) return;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setState({ kind: "loading" });
    try {
      const results = await searchTaste(query, type, c.signal);
      if (!c.signal.aborted) setState({ kind: "done", results });
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      const msg =
        err instanceof ApiError && err.code === "QLOO_NOT_CONFIGURED"
          ? "Taste search isn't available on this deployment — you can continue without it."
          : err instanceof ApiError
            ? err.message
            : "Search failed. Please try again.";
      setState({ kind: "error", msg });
    }
  };

  const add = (c: TasteCandidate) => {
    if (seeds.some((x) => x.entity_id === c.entity_id) || seeds.length >= MAX_SEEDS) return;
    onChange([...seeds, c]);
    setState({ kind: "idle" });
    setQ("");
  };

  return (
    <div className={s.taste}>
      <p className={s.muted}>
        Name a few favourites. Qloo uses confirmed picks to find related artists and films that shape
        your music suggestion and layout ranking. A photo alone can&apos;t tell us your taste.
      </p>
      <form className={s.searchRow} onSubmit={search} role="search">
        <label className={s.srOnly} htmlFor="taste-type">Category</label>
        <select id="taste-type" className={s.select} value={type} onChange={(e) => setType(e.target.value as TasteType)}>
          {TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <label className={s.srOnly} htmlFor="taste-q">Favourite</label>
        <input
          id="taste-q"
          className={s.input}
          value={q}
          maxLength={80}
          placeholder={`e.g. a favourite ${TYPES.find((t) => t.id === type)?.label.toLowerCase()}`}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className={s.secondary} disabled={q.trim().length < 2 || state.kind === "loading" || seeds.length >= MAX_SEEDS}>
          {state.kind === "loading" ? "Searching…" : "Search"}
        </button>
      </form>

      <div aria-live="polite">
        {state.kind === "error" && <p className={s.error}>{state.msg}</p>}
        {state.kind === "done" && state.results.length === 0 && (
          <p className={s.muted}>No matches — try another spelling or category.</p>
        )}
        {state.kind === "done" && state.results.length > 0 && (
          <>
            <p className={s.muted}>Which one did you mean?</p>
            <ul className={s.candidates}>
              {state.results.map((c) => (
                <li key={c.entity_id}>
                  <button className={s.candidate} onClick={() => add(c)}>
                    <strong>{c.name}</strong>
                    {c.disambiguation && <span className={s.muted}> — {c.disambiguation}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {seeds.length > 0 && (
        <ul className={s.chips} aria-label="Confirmed favourites">
          {seeds.map((seed) => (
            <li key={seed.entity_id} className={`${s.chip} ${s.chipOn}`}>
              {seed.name}
              <span className={s.chipType}>{TYPES.find((t) => t.id === seed.entity_type)?.label}</span>
              <button className={s.chipX} aria-label={`Remove ${seed.name}`} onClick={() => onChange(seeds.filter((x) => x !== seed))}>×</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
