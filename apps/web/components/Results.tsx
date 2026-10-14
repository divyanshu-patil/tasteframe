"use client";

import { useMemo, useState } from "react";
import type { Analysis, LayoutSuggestion, Music } from "../lib/api";
import type { Photo } from "../lib/story/draw";
import { TEMPLATES, defaultState } from "../lib/story/templates";
import { type StoryState, TEMPLATE_IDS, type TemplateId } from "../lib/story/types";
import { inputFor, songFor } from "../lib/story/input";
import { useCoverImage } from "./CoverPanel";
import { PinSource } from "./PinSource";
import { pinsFor } from "../lib/story/pins";
import { LikeButton, NewBadge } from "./LikeButton";
import { useMasks } from "./useMasks";
import { StoryCanvas } from "./StoryCanvas";
import s from "./maker.module.css";

interface Props {
  photo: Photo | Photo[];
  analysis: Analysis | null;
  suggestions: LayoutSuggestion[];
  date: Date;
  onEdit: (id: TemplateId) => void;
  onStartOver: () => void;
  onRetry?: () => void;
  /** Set when shuffling needs a login (guests): resolves true once signed in and unlocked. */
  onUnlock?: () => Promise<boolean>;
}

const TREND_LABEL = { chart: "🔥 Top on Apple Music now", reels: "🔥 Trending on Reels" } as const;

/** Shown while songs are picked (they arrive after the layouts). */
export function MusicLoading() {
  return (
    <article className={s.music} aria-label="Music suggestion" aria-busy="true">
      <p className={s.kicker}>Song suggestion</p>
      <p className={s.small} role="status">♪ Finding songs that fit your photo…</p>
    </article>
  );
}

export function MusicCard({ music }: { music: Music }) {
  return (
    <article className={s.music} aria-label="Music suggestion">
      <p className={s.kicker}>
        {music.kind === "track" ? "Song suggestion" : music.kind === "artist" ? "Artist suggestion" : "Music"}
        {music.vibe && <> · vibe: {music.vibe}</>}
      </p>
      {music.kind === "track" && <p className={s.musicTitle}>{music.title}</p>}
      {music.artist && (
        <p className={music.kind === "track" ? s.musicArtist : s.musicTitle}>
          {music.artist}
          {music.artist_source === "qloo" && <span className={s.tags}> · via Qloo</span>}
        </p>
      )}
      {music.trending && <p className={s.small}><strong>{TREND_LABEL[music.trending]}</strong></p>}
      {music.why && <p className={s.small}>“{music.why}”</p>}
      {music.url && (
        <a className={s.textLink} href={music.url} target="_blank" rel="noopener noreferrer">
          Open in Apple Music ↗
        </a>
      )}
      {music.alternatives.length > 0 && (
        <>
          <p className={s.small}>Also fits:</p>
          <ul className={s.recs}>
            {music.alternatives.slice(0, 3).map((a) => (
              <li key={`${a.artist}-${a.title}`}>
                {a.url ? (
                  <a className={s.textLink} href={a.url} target="_blank" rel="noopener noreferrer">{a.title}</a>
                ) : (
                  <strong>{a.title}</strong>
                )}{" "}
                <span className={s.muted}>{a.artist}</span>
                {a.trending && <span className={s.tags}> {TREND_LABEL[a.trending]}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
      <p className={s.small}>{music.explanation}</p>
      {music.kind !== "none" && (
        <p className={s.small}>Add it with Instagram&apos;s Music sticker after you post.</p>
      )}
    </article>
  );
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div className={s.bar}>
      <span>{label}</span>
      <span className={s.barTrack}><span style={{ width: `${Math.round(value * 100)}%` }} /></span>
    </div>
  );
}

export function Results({ photo, analysis, suggestions, date, onEdit, onStartOver, onRetry, onUnlock }: Props) {
  // `suggestions` is the ranked list (best first, families interleaved; a guest's holds the top 3
  // until they log in); show 3 at a time.
  const [page, setPage] = useState(0);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const shuffle = async () => {
    setUnlockError(null);
    try {
      if (onUnlock && !(await onUnlock())) return;
      setPage((p) => p + 1); // pages may have just grown: always read `page % pages`
    } catch (e) {
      setUnlockError(e instanceof Error && e.message ? e.message : "Couldn't load more layouts.");
    }
  };
  const pages = Math.max(1, Math.ceil(suggestions.length / 3));
  const shown = suggestions.slice((page % pages) * 3, (page % pages) * 3 + 3);
  const previews = useMemo(
    () => shown.map((l) => ({ layout: l, state: defaultState(l.id, inputFor(l, analysis, date)) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `shown` is derived from these
    [suggestions, analysis, date, page],
  );
  const others = TEMPLATE_IDS.filter((id) => !shown.some((l) => l.id === id));
  const vp = analysis?.visual_profile;
  const prov = analysis?.provenance;

  return (
    <section className={s.results}>
      <div className={s.resultsHead}>
        <h2 className={s.sectionTitle}>Three Stories for this photo</h2>
        <div className={s.row}>
          {(pages > 1 || onUnlock) && (
            <button className={s.secondary} onClick={() => void shuffle()} aria-label={`Shuffle: show three different layouts${onUnlock ? " (needs login)" : ""}`}>
              ↻ Shuffle layouts {onUnlock ? "🔒" : <span className={s.mono}>&nbsp;{(page % pages) + 1}/{pages}</span>}
            </button>
          )}
          {onRetry && <button className={s.secondary} onClick={onRetry}>Retry personalisation</button>}
          <button className={s.linkBtn} onClick={onStartOver}>Start over &amp; delete upload</button>
        </div>
      </div>

      {unlockError && <p role="alert" className={s.notice}>{unlockError}</p>}
      {!analysis && (
        <p role="status" className={s.notice}>
          Personalised analysis is unavailable right now, so these are standard layouts — no visual or
          Qloo data was used. You can still edit and export.
        </p>
      )}
      {prov?.layouts_by_qloo === true && (
        <p role="status" className={s.notice}>
          <strong>Layout suggestions powered by Qloo: ranked by how your taste matches each layout&apos;s style.</strong>
        </p>
      )}
      {prov?.music_off === true && (
        <p role="status" className={s.notice}>
          <strong>Can&apos;t suggest music while Qloo is off.</strong> You can still add a song with
          Instagram&apos;s Music sticker after you post.
        </p>
      )}
      {prov?.qloo_error && (
        <p role="status" className={s.notice}>
          Qloo cultural recommendations were unavailable ({prov.qloo_error}). Layouts below use your
          photo&apos;s visual mood only.
        </p>
      )}

      <ol className={s.gallery}>
        {previews.map(({ layout, state }, i) => (
          <li key={layout.id} className={s.option}>
            <button className={s.optionPreview} onClick={() => onEdit(layout.id)} aria-label={`Edit the ${layout.name} layout`}>
              <PreviewCanvas photo={photo} state={state} label={`${layout.name} Story preview`} />
            </button>
            <p className={s.optionNo}>No. {(page % pages) * 3 + i + 1}{page % pages === 0 && i === 0 ? " · best match" : ""}</p>
            <h3 className={s.optionName}>{layout.name}</h3>
            {analysis && <SongLine music={analysis.music_pending ? null : songFor(layout, analysis)} pending={analysis.music_pending} />}
            <div className={s.layoutMeta}>
              <NewBadge id={layout.id} isNew={layout.is_new} />
              <LikeButton id={layout.id} />
            </div>
            <p className={s.small}>{layout.reason}</p>
            {pinsFor(layout.id)[0] && <PinSource pin={pinsFor(layout.id)[0]!} />}
            {analysis && (
              <details className={s.details}>
                <summary>Why this ranking</summary>
                <Bar label="Visual fit" value={layout.score.visual_fit} />
                <Bar label={prov?.layouts_by_qloo ? "Qloo taste fit" : "Cultural style"} value={layout.score.cultural_style_fit} />
                <Bar label="Readability" value={layout.score.readability_fit} />
                <p className={s.small}>
                  {prov?.layouts_by_qloo
                    ? `Qloo scored each layout's style tags against your taste; the weighting (${prov.layout_rule}) is ours.`
                    : `Internal heuristic (${prov?.layout_rule}), not a provider score.`}
                </p>
              </details>
            )}
            <button className={s.primary} onClick={() => onEdit(layout.id)}>Edit this Story</button>
          </li>
        ))}
      </ol>

      <div className={s.others}>
        <p className={s.kicker}>Or start from another layout{onUnlock ? " · log in" : ""}</p>
        <div className={s.chips}>
          {others.map((id) => (
            <button key={id} className={s.chip} onClick={() => onEdit(id)}>{TEMPLATES[id].name}</button>
          ))}
        </div>
      </div>

      {analysis && vp && (
        <div className={s.insights}>
          <article>
            <p className={s.kicker}>Visual read · measured from pixels on our server</p>
            <div className={s.swatches}>
              {vp.palette.map((c) => <span key={c} style={{ background: c }} title={c} />)}
            </div>
            <dl className={s.facts}>
              <dt>Mood</dt><dd>{vp.mood.join(", ")}{vp.source !== "vision" && " (includes your picks)"}
                {analysis.image_reasoning && " · informed by image reasoning"}</dd>
              <dt>Light</dt><dd>{Math.round(vp.brightness * 100)}% brightness · {Math.round(vp.contrast * 100)}% contrast</dd>
              <dt>Colour</dt><dd>{vp.warmth > 0.1 ? "warm" : vp.warmth < -0.08 ? "cool" : "neutral"} · {Math.round(vp.saturation * 100)}% saturation</dd>
              <dt>Framing</dt><dd>{vp.composition}</dd>
            </dl>
          </article>

          {analysis.image_reasoning && (
            <article>
              <p className={s.kicker}>Image reasoning · {analysis.image_reasoning.model} via Ollama</p>
              {analysis.image_reasoning.about && (
                <p className={s.small}>
                  About: <strong>{analysis.image_reasoning.about.replace("_", " & ")}</strong>
                </p>
              )}
              <p>{analysis.image_reasoning.summary}</p>
              {analysis.image_reasoning.elements.length > 0 && (
                <ul className={s.chips} aria-label="Main elements">
                  {analysis.image_reasoning.elements.map((e) => (
                    <li key={e} className={s.chip}>{e}</li>
                  ))}
                </ul>
              )}
              {analysis.image_reasoning.scene.length > 0 && (
                <p className={s.tags}>{analysis.image_reasoning.scene.join(" · ")}</p>
              )}
              {analysis.image_reasoning.headline_ideas.length > 0 && (
                <p className={s.small}>
                  Headline ideas used above:{" "}
                  {analysis.image_reasoning.headline_ideas.map((h) => `“${h}”`).join(", ")}
                </p>
              )}
            </article>
          )}

          <article>
            <p className={s.kicker}>Cultural taste · from Qloo</p>
            {prov && prov.seeds.length === 0 && (
              <p className={s.small}>
                No favourites added, so Qloo used the artist picked for your photo&apos;s vibe as its signal.
                Log in and add favourite artists to personalise further.
              </p>
            )}
            {prov && prov.seeds.length > 0 && (
              <p className={s.small}>Signals you confirmed: {prov.seeds.join(", ")}</p>
            )}
            {analysis.cultural_recommendations.length > 0 && (
              <ul className={s.recs}>
                {analysis.cultural_recommendations.map((r) => (
                  <li key={r.entity_id}>
                    <strong>{r.name}</strong> <span className={s.muted}>{r.kind === "movie" ? "film" : r.kind}</span>
                    {r.tags.length > 0 && <span className={s.tags}>{r.tags.join(" · ")}</span>}
                  </li>
                ))}
              </ul>
            )}
          </article>

          {analysis.music_pending ? (
            <MusicLoading />
          ) : (
            // Follows the shuffle: this page's first layout's song leads.
            <MusicCard music={songFor(shown[0] ?? null, analysis) ?? analysis.music} />
          )}
        </div>
      )}
    </section>
  );
}

/** This layout's own song, under its preview. */
function SongLine({ music, pending }: { music: Music | null; pending: boolean }) {
  if (pending) return <p className={s.small} role="status">♪ finding a song…</p>;
  if (!music || music.kind !== "track") return null;
  return (
    <p className={s.small}>
      ♪ <strong>{music.title}</strong> — {music.artist}
      {music.trending && <span className={s.tags}> {TREND_LABEL[music.trending]}</span>}
    </p>
  );
}

/** Suggestion preview; song-cover layouts show the suggested song's real artwork when available. */
function PreviewCanvas({ photo, state, label }: { photo: React.ComponentProps<typeof StoryCanvas>["photo"]; state: StoryState; label: string }) {
  const cover = useCoverImage(state.cover?.show ? state.cover.trackId : undefined);
  const masks = useMasks(photo, Boolean(TEMPLATES[state.templateId].needsMask));
  return <StoryCanvas photo={photo} state={state} cover={cover} masks={masks} width={240} label={label} />;
}
