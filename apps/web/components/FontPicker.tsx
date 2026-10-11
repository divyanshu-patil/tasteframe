"use client";

import { useEffect, useRef, useState } from "react";
import { fontStack } from "../lib/story/draw";
import { type FontSpec, GOOGLE_FONTS, ROLE_FONTS, ensureFont, fontFailed, loadCatalogue, searchFonts } from "../lib/story/fonts";
import type { FontRole, TextLayer } from "../lib/story/types";
import s from "./maker.module.css";

export const ROLE_LABELS: { id: FontRole; label: string }[] = [
  { id: "display", label: "Didone" },
  { id: "serif", label: "Book serif" },
  { id: "italic", label: "Italic serif" },
  { id: "sans", label: "Grotesk" },
  { id: "hand", label: "Handwritten" },
  { id: "mono", label: "Typewriter" },
];

interface Option {
  key: string;
  group: string;
  label: string;
  style: React.CSSProperties;
  patch: Partial<TextLayer>;
}

const roleStyle = (r: FontRole): React.CSSProperties => ({
  fontFamily: fontStack(r),
  fontWeight: r === "sans" ? 700 : r === "display" || r === "hand" ? 600 : 400,
  fontStyle: r === "italic" ? "italic" : "normal",
});

/** Font menu where every name is set in its own font. Hovering (or arrowing to) an option shows
 *  it on the Story right away (`onPreview`); clicking keeps it. The layout's own font comes first
 *  and is what "Layout default" goes back to. */
export function FontPicker({
  layer,
  layoutRole,
  onChange,
  onPreview,
}: {
  layer: TextLayer;
  layoutRole: FontRole;
  onChange: (p: Partial<TextLayer>) => void;
  onPreview: (p: Partial<TextLayer> | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [all, setAll] = useState<FontSpec[] | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);

  const custom = layer.family && !GOOGLE_FONTS.some((f) => f.family === layer.family) ? layer.family : null;
  const googleStyle = (family: string): React.CSSProperties => ({ fontFamily: `"${family}", ${fontStack(layer.font)}` });
  const options: Option[] = [
    { key: "default", group: "This layout", label: `Layout default — ${ROLE_FONTS[layoutRole]}`, style: roleStyle(layoutRole), patch: { font: layoutRole, family: undefined } },
    ...ROLE_LABELS.filter((r) => r.id !== layoutRole).map((r) => ({
      key: `r:${r.id}`,
      group: "This layout",
      label: `${r.label} — ${ROLE_FONTS[r.id]}`,
      style: roleStyle(r.id),
      patch: { font: r.id, family: undefined },
    })),
    ...GOOGLE_FONTS.map((f) => ({ key: `g:${f.family}`, group: `Google Fonts · ${f.group}`, label: f.family, style: googleStyle(f.family), patch: { family: f.family } })),
    ...(custom ? [{ key: `g:${custom}`, group: "Your font", label: custom, style: googleStyle(custom), patch: { family: custom } }] : []),
  ];
  const current = layer.family ? `g:${layer.family}` : layer.font === layoutRole ? "default" : `r:${layer.font}`;
  const selected = options.find((o) => o.key === current) ?? options[0]!;

  // Never leave a hover preview behind when the menu goes away (e.g. another element selected).
  // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount only
  useEffect(() => () => onPreview(null), []);

  const close = () => {
    setOpen(false);
    setQuery("");
    onPreview(null);
  };
  // Search as you type, debounced so each keystroke doesn't re-filter ~1,800 fonts and fetch faces.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);
  useEffect(() => {
    if (debounced && !all) void loadCatalogue().then(setAll);
  }, [debounced, all]);
  const curated: FontSpec[] = GOOGLE_FONTS.map((f) => ({ family: f.family, category: f.group, regular: 400, bold: Boolean(f.bold) }));
  const results = debounced ? searchFonts(all ?? curated, debounced) : null;
  const resultKey = results?.map((f) => f.family).join("|") ?? "";
  useEffect(() => {
    results?.forEach((f) => ensureFont(f.family)); // load just the matches, to show them in their face
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the result list
  }, [resultKey]);
  const resultOptions: Option[] = (results ?? []).map((f) => ({
    key: `g:${f.family}`,
    group: `${f.category}`,
    label: f.family,
    style: googleStyle(f.family),
    patch: { family: f.family },
  }));

  const choose = (o: Option) => {
    onChange(o.patch);
    close();
  };

  useEffect(() => {
    if (!open) return;
    GOOGLE_FONTS.forEach((f) => ensureFont(f.family)); // so every name renders in its own face
    list.current?.querySelector<HTMLElement>("[aria-selected='true']")?.scrollIntoView({ block: "nearest" });
    const away = (e: PointerEvent) => !root.current?.contains(e.target as Node) && close();
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- (re)bind only when opening
  }, [open]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...(list.current?.querySelectorAll<HTMLElement>("[role='option']") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    items[Math.max(0, Math.min(items.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))]?.focus();
  };

  const shownOptions = results ? resultOptions : options;
  const groups = results ? ["results"] : [...new Set(options.map((o) => o.group))];
  return (
    <div className={s.fontPicker} ref={root} onKeyDown={onKey}>
      <span className={s.fontLabel}>Font</span>
      <button type="button" className={s.fontButton} aria-haspopup="listbox" aria-expanded={open} onClick={() => (open ? close() : setOpen(true))}>
        <span style={selected.style}>{selected.label}</span>
        <span aria-hidden>▾</span>
      </button>
      {open && (
        <div className={s.fontPanel}>
          <div className={s.fontSearch}>
            <input
              className={s.input}
              type="search"
              autoFocus
              value={query}
              maxLength={40}
              placeholder="Search all Google Fonts…"
              aria-label="Search Google Fonts"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && resultOptions[0]) choose(resultOptions[0]);
              }}
            />
          </div>
          <div ref={list} role="listbox" aria-label="Fonts" onMouseLeave={() => onPreview(null)}>
            {results && results.length === 0 && (
              <p className={s.fontEmpty}>{all ? `No Google Font matches “${debounced}”.` : "Searching…"}</p>
            )}
            {groups.map((g) => (
              <div key={g} role="group" aria-label={g === "results" ? "Search results" : g}>
                <p className={s.fontGroup}>{g === "results" ? `${results!.length} match${results!.length === 1 ? "" : "es"}${all ? "" : " (more loading…)"}` : g}</p>
                {shownOptions
                  .filter((o) => g === "results" || o.group === g)
                  .map((o) => (
                    <button
                      key={o.key}
                      type="button"
                      role="option"
                      aria-selected={o.key === current}
                      className={s.fontOption}
                      style={o.style}
                      onMouseEnter={() => onPreview(o.patch)}
                      onFocus={() => onPreview(o.patch)}
                      onClick={() => choose(o)}
                    >
                      {o.label}
                      {g === "results" && <span className={s.fontMeta}>{o.group}</span>}
                    </button>
                  ))}
              </div>
            ))}
          </div>
        </div>
      )}
      {layer.family && fontFailed(layer.family) && <p className={s.error}>Google Fonts has no “{layer.family}” — showing the layout font instead.</p>}
    </div>
  );
}
