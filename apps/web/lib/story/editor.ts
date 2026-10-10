// Editor state transitions — pure, so they are unit-testable and serializable.
import type { FilterId } from "./filters";
import type { Sticker } from "./stickers";
import { defaultState } from "./templates";
import type { StoryState, TemplateId, TemplateInput, TextKey, TextLayer } from "./types";

export type EditorAction =
  | { type: "text"; key: TextKey; patch: Partial<TextLayer> }
  | { type: "move"; key: TextKey; x: number; y: number }
  | { type: "crop"; patch: Partial<StoryState["crop"]> }
  | { type: "overlay"; patch: Partial<StoryState["overlay"]> }
  | { type: "decoration"; key: string; on: boolean }
  | { type: "filter"; id: FilterId }
  | { type: "sticker-add"; sticker: Sticker }
  | { type: "sticker"; id: string; patch: Partial<Omit<Sticker, "id" | "kind">> }
  | { type: "sticker-remove"; id: string }
  | { type: "template"; id: TemplateId; input: TemplateInput }
  | { type: "reset"; input: TemplateInput };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function editorReducer(s: StoryState, a: EditorAction): StoryState {
  switch (a.type) {
    case "text": {
      const next = { ...s[a.key], ...a.patch };
      next.size = clamp(next.size, 12, 240);
      return { ...s, [a.key]: next };
    }
    case "move":
      return { ...s, [a.key]: { ...s[a.key], x: clamp(a.x, 0, 1), y: clamp(a.y, 0, 0.97) } };
    case "crop": {
      const c = { ...s.crop, ...a.patch };
      return {
        ...s,
        crop: { zoom: clamp(c.zoom, 1, 4), x: clamp(c.x, 0, 1), y: clamp(c.y, 0, 1), fit: c.fit === "contain" ? "contain" : "cover" },
      };
    }
    case "filter":
      return { ...s, filter: a.id };
    case "sticker-add":
      return { ...s, stickers: [...(s.stickers ?? []), a.sticker].slice(-24) };
    case "sticker": {
      const stickers = (s.stickers ?? []).map((st) => {
        if (st.id !== a.id) return st;
        const n = { ...st, ...a.patch };
        return { ...n, x: clamp(n.x, 0, 1), y: clamp(n.y, 0, 1), scale: clamp(n.scale, 0.3, 3), rotate: ((n.rotate % 360) + 360) % 360 };
      });
      return { ...s, stickers };
    }
    case "sticker-remove":
      return { ...s, stickers: (s.stickers ?? []).filter((st) => st.id !== a.id) };
    case "overlay": {
      const o = { ...s.overlay, ...a.patch };
      return { ...s, overlay: { ...o, strength: clamp(o.strength, 0, 1) } };
    }
    case "decoration":
      return { ...s, decorations: { ...s.decorations, [a.key]: a.on } };
    case "template": {
      // Switching layouts keeps the user's words, crop and stickers; styling (incl. filter)
      // comes from the new template.
      const fresh = defaultState(a.id, a.input);
      return {
        ...fresh,
        crop: s.crop,
        stickers: s.stickers ?? [],
        headline: { ...fresh.headline, text: s.headline.text },
        caption: { ...fresh.caption, text: s.caption.text },
      };
    }
    case "reset":
      return defaultState(s.templateId, a.input); // also clears stickers
  }
}
