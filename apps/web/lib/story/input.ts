import type { Analysis, LayoutSuggestion } from "../api";
import type { TemplateInput } from "./types";

/** Template inputs from an API suggestion; neutral defaults when analysis is unavailable. */
export function inputFor(layout: LayoutSuggestion | null, a: Analysis | null, date: Date): TemplateInput {
  return {
    headline: layout?.headline ?? "today, in frames.",
    caption: layout?.caption ?? "",
    accent: layout?.accent ?? "#c03f13",
    palette: a?.visual_profile.palette ?? [],
    date,
    focus: layout && (layout.focus_x !== 0.5 || layout.focus_y !== 0.5) ? { x: layout.focus_x, y: layout.focus_y } : undefined,
    filter: layout?.filter && layout.filter !== "none" ? layout.filter : undefined,
    music: a && a.music.kind !== "none" ? { title: a.music.title, artist: a.music.artist } : undefined,
    scene: a?.image_reasoning?.scene,
  };
}
