// Editor state transitions — pure, so they are unit-testable and serializable.
import type { CoverState } from "./cover";
import type { FilterId } from "./filters";
import type { Sticker } from "./stickers";
import { FAMILY_RE } from "./fonts";
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
  | { type: "box-filter"; id: FilterId }
  | { type: "seed"; seed: number }
  | { type: "lines"; patch: Partial<NonNullable<StoryState["lines"]>> }
  | { type: "sticker-add"; sticker: Sticker }
  | { type: "sticker"; id: string; patch: Partial<Omit<Sticker, "id" | "kind">> }
  | { type: "sticker-remove"; id: string }
  | { type: "sticker-order"; id: string; to: "front" | "back" }
  | { type: "restore-elements"; input: TemplateInput }
  | { type: "cover"; patch: Partial<CoverState> }
  | { type: "spot"; x?: number; y?: number; w?: number; h?: number; dx?: number; dy?: number }
  | { type: "cover-move"; dx: number; dy: number }
  | { type: "tracks"; tracks: NonNullable<StoryState["tracks"]> }
  | { type: "prop"; id: string }
  | { type: "view"; key: string; dx?: number; dy?: number; zoom?: number; reset?: boolean }
  /** Move/resize a layout box; `from` is its current rect (0..1) when it hasn't been moved yet. */
  | { type: "box"; key: string; from: { x: number; y: number; w: number; h: number }; dx?: number; dy?: number; x?: number; y?: number; w?: number; h?: number; reset?: boolean }
  | { type: "sticker-move"; id: string; dx: number; dy: number }
  | { type: "move-by"; key: TextKey; dx: number; dy: number }
  | { type: "outline"; patch: Partial<NonNullable<StoryState["outline"]>> }
  | { type: "template"; id: TemplateId; input: TemplateInput }
  | { type: "reset"; input: TemplateInput };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function editorReducer(s: StoryState, a: EditorAction): StoryState {
  switch (a.type) {
    case "text": {
      const next = { ...s[a.key], ...a.patch };
      next.size = clamp(next.size, 8, 600);
      next.width = clamp(next.width, 0.1, 2);
      if (!next.family || !FAMILY_RE.test(next.family)) delete next.family; // back to the layout font
      return { ...s, [a.key]: next };
    }
    case "move":
      return { ...s, [a.key]: { ...s[a.key], x: clamp(a.x, 0, 1), y: clamp(a.y, 0, 0.97) } };
    case "crop": {
      const slot = a.slot ?? 0;
      const cur = slot === 0 ? s.crop : (s.crops?.[slot - 1] ?? s.crop);
      const c = { ...cur, ...a.patch };
      const rot = ([0, 90, 180, 270] as const).find((r) => r === (((c.rot ?? 0) % 360) + 360) % 360) ?? 0;
      const next = { zoom: clamp(c.zoom, 1, 10), x: clamp(c.x, 0, 1), y: clamp(c.y, 0, 1), fit: c.fit === "contain" ? "contain" : "cover", ...(rot ? { rot } : {}) } as const;
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
    case "box-filter":
      return s.boxFilter ? { ...s, boxFilter: a.id } : s;
    case "lines": {
      if (!s.lines) return s;
      const l = { ...s.lines, ...a.patch };
      return { ...s, lines: { gap: clamp(Math.round(l.gap), 0, 400), width: clamp(Math.round(l.width), 1, 80) } };
    }
    case "seed":
      return s.seed === undefined ? s : { ...s, seed: clamp(Math.round(a.seed), 0, 9999) };
    case "sticker-add":
      return { ...s, stickers: [...(s.stickers ?? []), a.sticker].slice(-24) };
    case "sticker": {
      const stickers = (s.stickers ?? []).map((st) => {
        if (st.id !== a.id) return st;
        const n = { ...st, ...a.patch };
        return { ...n, x: clamp(n.x, 0, 1), y: clamp(n.y, 0, 1), scale: clamp(n.scale, 0.1, 12), rotate: ((n.rotate % 360) + 360) % 360 };
      });
      return { ...s, stickers };
    }
    case "sticker-order": {
      const st = s.stickers.find((x) => x.id === a.id);
      if (!st) return s;
      const rest = s.stickers.filter((x) => x.id !== a.id);
      return { ...s, stickers: a.to === "front" ? [...rest, st] : [st, ...rest] };
    }
    case "restore-elements": {
      // Bring back the layout's own elements (e.g. after deleting one), keeping the user's.
      const fresh = defaultState(s.templateId, a.input).stickers;
      const have = new Set(s.stickers.map((x) => x.id));
      return { ...s, stickers: [...s.stickers, ...fresh.filter((x) => !have.has(x.id))] };
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
      return { ...s, cover: { ...c, x: clamp(c.x, 0, 1), y: clamp(c.y, 0, 1), scale: clamp(c.scale, 0.1, 10), rotate: clamp(c.rotate, -180, 180) } };
    }
    case "outline": {
      const o = { show: true, color: "#ffffff", width: 14, margin: 0, ...s.outline, ...a.patch };
      return { ...s, outline: { ...o, width: clamp(o.width, 0, 120), margin: clamp(o.margin ?? 0, 0, 200) } };
    }
    case "spot": {
      if (!s.spot) return s;
      // Absolute (sliders) or relative (drag) — relative reads the latest state, so fast
      // pointer moves accumulate correctly.
      const w = clamp(a.w ?? s.spot.w, 0.08, 1);
      const h = clamp(a.h ?? s.spot.h, 0.04, 1);
      const x = (a.x ?? s.spot.x) + (a.dx ?? 0);
      const y = (a.y ?? s.spot.y) + (a.dy ?? 0);
      return { ...s, spot: { w, h, x: clamp(x, 0, 1 - w), y: clamp(y, 0, 1 - h) } };
    }
    case "box": {
      const boxes = { ...s.boxes };
      if (a.reset) {
        delete boxes[a.key];
        return { ...s, boxes };
      }
      const b = boxes[a.key] ?? a.from;
      const w = clamp(a.w ?? b.w, 0.03, 1);
      const h = clamp(a.h ?? b.h, 0.02, 1);
      boxes[a.key] = { w, h, x: clamp((a.x ?? b.x) + (a.dx ?? 0), -w * 0.5, 1 - w * 0.5), y: clamp((a.y ?? b.y) + (a.dy ?? 0), -h * 0.5, 1 - h * 0.5) };
      return { ...s, boxes };
    }
    case "view": {
      const views = { ...s.views };
      if (a.reset) {
        delete views[a.key];
        return { ...s, views };
      }
      const v = views[a.key] ?? { dx: 0, dy: 0, zoom: 1 };
      views[a.key] = {
        dx: clamp(v.dx + (a.dx ?? 0), -1, 1),
        dy: clamp(v.dy + (a.dy ?? 0), -1, 1),
        zoom: clamp(v.zoom * (a.zoom ?? 1), 0.25, 10),
      };
      return { ...s, views };
    }
    case "prop":
      return { ...s, prop: a.id };
    case "tracks":
      return { ...s, tracks: a.tracks.slice(0, 10) };
    case "cover-move":
      return s.cover ? editorReducer(s, { type: "cover", patch: { x: s.cover.x + a.dx, y: s.cover.y + a.dy } }) : s;
    case "sticker-move": {
      const st = s.stickers.find((x) => x.id === a.id);
      return st ? editorReducer(s, { type: "sticker", id: a.id, patch: { x: st.x + a.dx, y: st.y + a.dy } }) : s;
    }
    case "move-by":
      return editorReducer(s, { type: "move", key: a.key, x: s[a.key].x + a.dx, y: s[a.key].y + a.dy });
    case "decoration":
      return { ...s, decorations: { ...s.decorations, [a.key]: a.on } };
    case "template": {
      // Switching layouts keeps the user's words, crop and stickers; styling (incl. filter)
      // comes from the new template.
      const fresh = defaultState(a.id, a.input);
      // Sideways layouts turn the photos; leaving one turns them back.
      const was = TEMPLATES[s.templateId].photoRot;
      const now = TEMPLATES[a.id].photoRot;
      const turn = (c: StoryState["crop"]) => (now ? { ...c, rot: now } : was ? { ...c, rot: undefined } : c);
      return {
        ...fresh,
        crop: turn(s.crop),
        crops: (s.crops ?? []).map(turn),
        prop: s.prop ?? fresh.prop,
        focus: s.focus ?? fresh.focus,
        order: s.order,
        // The user's own stickers stay; the old layout's placed elements give way to the new one's.
        stickers: [...(s.stickers ?? []).filter((x) => !x.layout), ...fresh.stickers],
        outline: s.outline ?? fresh.outline,
        tracks: s.tracks,
        views: s.views,
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
