"use client";

import { useEffect, useSyncExternalStore } from "react";
import { type SongEvent, track } from "../lib/analytics";
import { SAFE_PREVIEW_URL } from "../lib/api";
import s from "./maker.module.css";

// One preview plays at a time across the page. Apple's 30-second iTunes preview is streamed from
// Apple for listening here only: never downloaded, stored or added to exports.
export interface PreviewState {
  url: string | null;
  playing: boolean;
  time: number;
  duration: number;
}
let state: PreviewState = { url: null, playing: false, time: 0, duration: 30 };
let audio: HTMLAudioElement | null = null;
const listeners = new Set<() => void>();
const set = (patch: Partial<PreviewState>) => {
  state = { ...state, ...patch };
  listeners.forEach((f) => f());
};
const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => listeners.delete(f);
};
const SERVER: PreviewState = { url: null, playing: false, time: 0, duration: 30 };

export function usePreview(): PreviewState {
  return useSyncExternalStore(subscribe, () => state, () => SERVER);
}

export function stopPreview(): void {
  audio?.pause();
  set({ playing: false });
}

/** Play (or resume) a preview; counts as a listen. Returns false for non-Apple URLs. */
export function playPreview(url: string, song: SongEvent, onEnded?: () => void): boolean {
  if (!SAFE_PREVIEW_URL.test(url)) return false;
  if (audio && state.url === url) {
    void audio.play().catch(() => set({ playing: false }));
    set({ playing: true });
    return true;
  }
  audio?.pause();
  const a = new Audio(url);
  audio = a;
  a.ontimeupdate = () => audio === a && set({ time: a.currentTime, duration: a.duration || 30 });
  a.onended = () => {
    if (audio !== a) return;
    set({ playing: false, time: 0 });
    onEnded?.();
  };
  a.onerror = () => audio === a && set({ playing: false });
  set({ url, playing: true, time: 0, duration: 30 });
  void a.play().catch(() => set({ playing: false }));
  track("song_listen", song);
  return true;
}

/** Small play/stop pill for one song (lists, the editor). */
export function SongPreview({ url, label, song }: { url: string | null; label: string; song: SongEvent }) {
  const p = usePreview();
  useEffect(() => () => {
    if (state.url === url) stopPreview();
  }, [url]);
  if (!url || !SAFE_PREVIEW_URL.test(url)) return null;
  const playing = p.playing && p.url === url;
  return (
    <button
      type="button"
      className={s.previewBtn}
      onClick={() => (playing ? stopPreview() : playPreview(url, song))}
      aria-pressed={playing}
      aria-label={`${playing ? "Stop" : "Play"} 30-second preview of ${label}`}
    >
      {playing ? "■ Stop" : "▶ 30 s preview"}
    </button>
  );
}

/** Required credit wherever previews play. */
export function PreviewCredit() {
  return <p className={s.small}>Previews courtesy of Apple Music.</p>;
}
