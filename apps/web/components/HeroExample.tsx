"use client";

import { useEffect, useState } from "react";
import { drawSample } from "../lib/sample";
import { defaultState } from "../lib/story/templates";
import type { TemplateId } from "../lib/story/types";
import { StoryCanvas } from "./StoryCanvas";
import s from "./maker.module.css";

const EXAMPLES: { id: TemplateId; headline: string; caption: string }[] = [
  { id: "editorial", headline: "the silence that heals.", caption: "On repeat — a slow-burn indie record for the drive home." },
  { id: "cinematic", headline: "the art of observing.", caption: "now playing — something with strings" },
  { id: "scrapbook", headline: "golden hour, again", caption: "keep this one." },
];
const DATE = new Date(2026, 9, 10);

/** Example output on the landing page, rendered by the same engine as real exports. */
export function HeroExample() {
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
  return (
    <div className={s.heroStack} aria-hidden={!photo}>
      {EXAMPLES.map((ex, i) => (
        <div key={ex.id} className={s.heroCard} style={{ ["--i" as string]: i }}>
          {photo ? (
            <StoryCanvas
              photo={photo}
              width={200}
              label={`Example ${ex.id} Story`}
              state={defaultState(ex.id, {
                headline: ex.headline,
                caption: ex.caption,
                accent: "#c03f13",
                palette: ["#c9756b", "#3e2c3d", "#f2b47a"],
                date: DATE,
              })}
            />
          ) : (
            <div className={s.heroPlaceholder} />
          )}
        </div>
      ))}
    </div>
  );
}
