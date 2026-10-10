// Editor state transitions — pure, so they are unit-testable and serializable.
import type { CoverState } from "./cover";
import type { FilterId } from "./filters";
import type { Sticker } from "./stickers";
import { TEMPLATES, defaultState } from "./templates";
import type { StoryState, TemplateId, TemplateInput, TextKey, TextLayer } from "./types";

export type EditorAction =
  | { type: "text"; key: TextKey; patch: Partial<TextLayer> }
  | { type: "move"; key: TextKey; x: number; y: number }
  | { type: "crop"; patch: Partial<StoryState["crop"]>; slot?: number }
  | { type: "swap"; a: number; b: number }
  | { type: "overlay"; patch: Partial<StoryState["overlay"]> }
  | { type: "decoration"; key: string; on: boolean }
  | { type: "filter"; id: FilterId }
  | { type: "sticker-add"; sticker: Sticker }
  | { type: "sticker"; id: string; patch: Partial<Omit<Sticker, "id" | "kind">> }
  | { type: "sticker-remove"; id: string }
  | { type: "cover"; patch: Partial<CoverState> }
  | { type: "spot"; x: number; y: number }
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
      const slot = a.slot ?? 0;
      const cur = slot === 0 ? s.crop : (s.crops?.[slot - 1] ?? s.crop);
      const c = { ...cur, ...a.patch };
      const next = { zoom: clamp(c.zoom, 1, 4), x: clamp(c.x, 0, 1), y: clamp(c.y, 0, 1), fit: c.fit === "contain" ? "contain" : "cover" } as const;
      if (slot === 0) return { ...s, crop: next };
      const crops = [...(s.crops ?? [])];
      while (crops.length < slot) crops.push({ zoom: 1, x: 0.5, y: 0.5, fit: "cover" });
      crops[slot - 1] = next;
      return { ...s, crops };
    }
    case "swap": {
      // Swap the photos in two slots; each photo keeps its own crop.
      if (a.a === a.b) return s;
      const order = [...(s.order?.length ? s.order : [0, 1, 2, 3])];
      const crops = [s.crop, ...(s.crops ?? [])];
      while (crops.length < 4) crops.push({ zoom: 1, x: 0.5, y: 0.5, fit: "cover" });
      [order[a.a], order[a.b]] = [order[a.b]!, order[a.a]!];
      [crops[a.a], crops[a.b]] = [crops[a.b]!, crops[a.a]!];
      return { ...s, order, crop: crops[0]!, crops: crops.slice(1) };
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
    case "cover": {
      if (!s.cover) return s;
      const c = { ...s.cover, ...a.patch };
      return { ...s, cover: { ...c, x: clamp(c.x, 0, 1), y: clamp(c.y, 0, 1), scale: clamp(c.scale, 0.3, 4), rotate: clamp(c.rotate, -180, 180) } };
    }
    case "spot": {
      if (!s.spot) return s;
      return { ...s, spot: { ...s.spot, x: clamp(a.x, 0, 1 - s.spot.w), y: clamp(a.y, 0, 1 - s.spot.h) } };
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
        focus: s.focus ?? fresh.focus,
        order: s.order,
        crops: s.crops,
        stickers: s.stickers ?? [],
        // A song-cover layout places the cover its way; otherwise a cover the user added stays.
        // The chosen song always carries over.
        cover: fresh.cover && s.cover
          ? {
              ...(fresh.cover.show || !s.cover.show || TEMPLATES[s.templateId].cover?.show ? fresh.cover : s.cover),
              title: s.cover.title,
              artist: s.cover.artist,
              trackId: s.cover.trackId,
            }
          : fresh.cover,
        headline: { ...fresh.headline, text: s.headline.text },
        caption: { ...fresh.caption, text: s.caption.text },
      };
    }
    case "reset":
      return defaultState(s.templateId, a.input); // also clears stickers
  }
}
