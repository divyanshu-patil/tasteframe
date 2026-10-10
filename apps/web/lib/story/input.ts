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
  };
}
