"use client";

import { useEffect, useMemo, useState } from "react";
import { drawSample } from "../lib/sample";
import { LAYOUT_GROUPS } from "../lib/story/groups";
import { type Pin, PINS, pinsFor } from "../lib/story/pins";
import { TEMPLATES, defaultState } from "../lib/story/templates";
import type { TemplateId } from "../lib/story/types";
import { LikeButton, NewBadge } from "./LikeButton";
import { PinSource } from "./PinSource";
import { track } from "../lib/analytics";
import { StoryCanvas } from "./StoryCanvas";
import s from "./maker.module.css";

const DATE = new Date(2026, 9, 10);
const layoutText = (id: TemplateId, group: string) =>
  [id, TEMPLATES[id].name, TEMPLATES[id].blurb, group, ...pinsFor(id).map((p) => p.author)].join(" ").toLowerCase();
const pinText = (p: Pin) =>
  [p.author, p.category, ...p.layouts.flatMap((id) => [id, id in TEMPLATES ? TEMPLATES[id as TemplateId].name : ""])].join(" ").toLowerCase();
const INPUT = { headline: "golden hour, again", caption: "keep this one.", accent: "#c03f13", palette: ["#c9756b", "#3e2c3d", "#f2b47a"], date: DATE };

/** Renders its Story only once scrolled near the viewport (dozens of canvases on one page). */
function LazyStory({ id, photo }: { id: TemplateId; photo: HTMLCanvasElement }) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!el || seen) return;
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setSeen(true), { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [el, seen]);
  const state = useMemo(() => defaultState(id, INPUT), [id]);
  return (
    <div ref={setEl} className={s.galleryStory}>
      {seen ? <StoryCanvas photo={photo} state={state} width={180} label={`${TEMPLATES[id].name} example`} /> : null}
    </div>
  );
}

export function Gallery({ focus }: { focus?: TemplateId }) {
  const [tab, setTab] = useState<"layouts" | "references">(focus ? "references" : "layouts");
  const [photo, setPhoto] = useState<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = document.createElement("canvas");
    c.width = 1080;
    c.height = 1440;
    const ctx = c.getContext("2d");
    if (ctx) {
      drawSample(ctx, c.width, c.height);
      setPhoto(c);
    }
  }, []);
  const [query, setQuery] = useState("");
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (text: string) => terms.every((t) => text.includes(t));
  const groups = LAYOUT_GROUPS.map((g) => ({ ...g, ids: g.ids.filter((id) => matches(layoutText(id, g.name))) })).filter((g) => g.ids.length);
  const refs = (focus ? [...pinsFor(focus), ...PINS.filter((p) => !p.layouts.includes(focus))] : PINS).filter((p) => matches(pinText(p)));

  return (
    <div className={s.galleryPage}>
      <div className={s.segment} role="tablist" aria-label="Gallery">
        <button role="tab" aria-selected={tab === "layouts"} className={tab === "layouts" ? s.segOn : ""} onClick={() => setTab("layouts")}>
          Layouts
        </button>
        <button role="tab" aria-selected={tab === "references"} className={tab === "references" ? s.segOn : ""} onClick={() => setTab("references")}>
          Pinterest references
        </button>
      </div>

      <input
        type="search"
        className={s.input}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={tab === "layouts" ? "Search layouts — cutout, song, film, phones…" : "Search pins — creator or layout name"}
        aria-label={tab === "layouts" ? "Search layouts" : "Search Pinterest references"}
      />
      {tab === "layouts" ? (
        groups.length === 0 ? (
          <p className={s.small}>No layouts match “{query}”.</p>
        ) : groups.map((g) => (
          <section key={g.id} className={s.galleryGroup} aria-labelledby={`g-${g.id}`}>
            <h2 id={`g-${g.id}`}>{g.name}</h2>
            <ul className={s.galleryGrid}>
              {g.ids.map((id) => {
                const pin = pinsFor(id)[0];
                return (
                  <li key={id} className={s.galleryItem}>
                    {photo && <LazyStory id={id} photo={photo} />}
                    <h3>{TEMPLATES[id].name}</h3>
                    <div className={s.layoutMeta}>
                      <NewBadge id={id} />
                      <LikeButton id={id} />
                    </div>
                    <p className={s.small}>{TEMPLATES[id].blurb}</p>
                    <a className={s.primary} href={`/create?layout=${id}`} onClick={() => track("gallery_pick", { layout: id })}>Use this layout</a>
                    {pin && <PinSource pin={pin} />}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      ) : (
        <section className={s.galleryGroup}>
          <p className={s.small}>
            Every Pinterest pin the layouts were modelled on, credited to its creator. Thumbnails come from Pinterest and open the original pin.
            {focus && ` Pins for ${TEMPLATES[focus].name} come first.`}
          </p>
          {refs.length === 0 && <p className={s.small}>No pins match “{query}”.</p>}
          <ul className={s.refGrid}>
            {refs.map((p) => (
              <li key={p.pin} className={s.refItem}>
                <PinSource pin={p} />
                {p.layouts.length > 0 ? (
                  <div className={s.chips}>
                    {p.layouts.filter((id): id is TemplateId => id in TEMPLATES).map((id) => (
                      <a key={id} className={s.chip} href={`/create?layout=${id}`}>
                        Use {TEMPLATES[id].name}
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className={s.small}>General inspiration (filters, stickers, palettes).</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
