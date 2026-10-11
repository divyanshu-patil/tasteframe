"use client";

import { useMemo, useState } from "react";
import type { Analysis, LayoutSuggestion, Music } from "../lib/api";
import type { Photo } from "../lib/story/draw";
import { TEMPLATES, defaultState } from "../lib/story/templates";
import { type StoryState, TEMPLATE_IDS, type TemplateId } from "../lib/story/types";
import { inputFor } from "../lib/story/input";
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
}

export function MusicCard({ music }: { music: Music }) {
  return (
    <article className={s.music} aria-label="Music suggestion">
      <p className={s.kicker}>
        {music.kind === "track" ? "Song suggestion" : music.kind === "artist" ? "Artist suggestion" : "Music"}
      </p>
      {music.kind === "track" && <p className={s.musicTitle}>{music.title}</p>}
      {music.artist && <p className={music.kind === "track" ? s.musicArtist : s.musicTitle}>{music.artist}</p>}
      <p className={s.small}>{music.explanation}</p>
      {music.kind !== "none" && (
        <p className={s.small}>
          Source: artist via Qloo{music.track_source === "itunes" && " · track metadata via Apple iTunes Search"}.
          Add it with Instagram&apos;s Music sticker after you post — audio isn&apos;t embedded in the PNG.
        </p>
      )}
      {music.url && (
        <a className={s.textLink} href={music.url} target="_blank" rel="noopener noreferrer">
          Open in Apple Music ↗
        </a>
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

export function Results({ photo, analysis, suggestions, date, onEdit, onStartOver, onRetry }: Props) {
  // `suggestions` is the full ranked list (best first, families interleaved); show 3 at a time.
  const [page, setPage] = useState(0);
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
          {pages > 1 && (
            <button className={s.secondary} onClick={() => setPage((p) => (p + 1) % pages)} aria-label="Shuffle: show three different layouts">
              ↻ Shuffle layouts <span className={s.mono}>&nbsp;{(page % pages) + 1}/{pages}</span>
            </button>
          )}
          {onRetry && <button className={s.secondary} onClick={onRetry}>Retry personalisation</button>}
          <button className={s.linkBtn} onClick={onStartOver}>Start over &amp; delete upload</button>
        </div>
      </div>

      {!analysis && (
        <p role="status" className={s.notice}>
          Personalised analysis is unavailable right now, so these are standard layouts — no visual or
          Qloo data was used. You can still edit and export.
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
                <Bar label="Cultural style" value={layout.score.cultural_style_fit} />
                <Bar label="Readability" value={layout.score.readability_fit} />
                <p className={s.small}>Internal heuristic ({prov?.layout_rule}), not a provider score.</p>
              </details>
            )}
            <button className={s.primary} onClick={() => onEdit(layout.id)}>Edit this Story</button>
          </li>
        ))}
      </ol>

      <div className={s.others}>
        <p className={s.kicker}>Or start from another layout</p>
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
              <p className={s.small}>No favourites given, so no Qloo request was made. Add a few to personalise.</p>
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

          <MusicCard music={analysis.music} />
        </div>
      )}
    </section>
  );
}

/** Suggestion preview; song-cover layouts show the suggested song's real artwork when available. */
function PreviewCanvas({ photo, state, label }: { photo: React.ComponentProps<typeof StoryCanvas>["photo"]; state: StoryState; label: string }) {
  const cover = useCoverImage(state.cover?.show ? state.cover.trackId : undefined);
  const masks = useMasks(photo, Boolean(TEMPLATES[state.templateId].needsMask));
  return <StoryCanvas photo={photo} state={state} cover={cover} masks={masks} width={240} label={label} />;
}
