import { type Analysis, type LayoutSuggestion, type Music, musicFor } from "../api";
import { songShift } from "../songShift";
import type { TemplateInput } from "./types";

/** Template inputs from an API suggestion; neutral defaults when analysis is unavailable. */
/** The song for this layout: each layout (by rank) gets its own from the suggested list. */
export function songFor(layout: LayoutSuggestion | null, a: Analysis | null): Music | null {
  if (!a || a.music.kind === "none") return null;
  const rank = layout ? Math.max(0, a.layouts.findIndex((l) => l.id === layout.id)) : 0;
  return musicFor(a.music, rank + songShift(a.analysis_id)); // the player's pick leads
}

export function inputFor(layout: LayoutSuggestion | null, a: Analysis | null, date: Date): TemplateInput {
  const m = songFor(layout, a);
  const line = m?.kind === "track" ? `now playing — ${m.title} · ${m.artist}` : m?.artist ? `on repeat — ${m.artist}` : "";
  return {
    headline: layout?.headline ?? "today, in frames.",
    caption: layout?.caption || line,
    accent: layout?.accent ?? "#c03f13",
    palette: a?.visual_profile.palette ?? [],
    date,
    focus: layout && (layout.focus_x !== 0.5 || layout.focus_y !== 0.5) ? { x: layout.focus_x, y: layout.focus_y } : undefined,
    filter: layout?.filter && layout.filter !== "none" ? layout.filter : undefined,
    focuses: layout?.focuses?.length ? layout.focuses : undefined,
    music: m ? { title: m.title, artist: m.artist, trackId: m.track_id } : undefined,
    scene: a?.image_reasoning?.scene,
  };
}
