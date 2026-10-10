"use client";

// Small, consistent editor controls: collapsible sections, sliders with fine nudges, colour
// fields and segmented choices. Every control names exactly what it changes.
import { type ReactNode, useId } from "react";
import s from "./maker.module.css";

export function Section({ title, hint, open, children }: { title: string; hint?: string; open?: boolean; children: ReactNode }) {
  return (
    <details className={s.section} open={open}>
      <summary className={s.sectionHead}>
        <span className={s.sectionTitle}>{title}</span>
        {hint && <span className={s.sectionHint}>{hint}</span>}
      </summary>
      <div className={s.sectionBody}>{children}</div>
    </details>
  );
}

/** Range slider with a readout and −/+ buttons for precise steps. */
export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format = (v) => v.toFixed(2),
  nudge = step * 5,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  nudge?: number;
}) {
  const id = useId();
  const set = (v: number) => onChange(Math.min(max, Math.max(min, Number(v.toFixed(4)))));
  return (
    <div className={s.slider}>
      <label htmlFor={id}>{label}</label>
      <output htmlFor={id}>{format(value)}</output>
      <button type="button" aria-label={`Decrease ${label}`} onClick={() => set(value - nudge)}>−</button>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(Number(e.target.value))} />
      <button type="button" aria-label={`Increase ${label}`} onClick={() => set(value + nudge)}>+</button>
    </div>
  );
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className={s.colorField}>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      <span>{label}</span>
    </label>
  );
}

export function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className={s.segment} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={value === o.id} className={value === o.id ? s.segOn : ""} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={s.check}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export const pct = (v: number) => `${Math.round(v * 100)}%`;
export const deg = (v: number) => `${Math.round(v)}°`;
export const px = (v: number) => `${Math.round(v)}px`;
export const times = (v: number) => `${v.toFixed(2)}×`;
