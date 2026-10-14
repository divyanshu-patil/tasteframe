"use client";

import { useEffect, useState } from "react";
import { type SongEvent, track } from "../lib/analytics";
import { SAFE_PREVIEW_URL } from "../lib/api";
import s from "./maker.module.css";

// One preview plays at a time across the page. Apple's 30-second iTunes preview is streamed from
// Apple for listening here only: never downloaded, stored or added to exports.
let current: { audio: HTMLAudioElement; stop: () => void } | null = null;

export function SongPreview({ url, label, song }: { url: string | null; label: string; song: SongEvent }) {
  const [playing, setPlaying] = useState(false);
  useEffect(() => () => {
    if (current && current.audio.src === url) current.stop();
  }, [url]);
  if (!url || !SAFE_PREVIEW_URL.test(url)) return null;

  const toggle = () => {
    if (playing && current) return current.stop();
    current?.stop();
    const audio = new Audio(url);
    const stop = () => {
      audio.pause();
      setPlaying(false);
      if (current?.audio === audio) current = null;
    };
    audio.onended = stop;
    audio.onerror = stop;
    current = { audio, stop };
    setPlaying(true);
    void audio.play().catch(stop);
    track("song_listen", song);
  };
  return (
    <button
      type="button"
      className={s.previewBtn}
      onClick={toggle}
      aria-pressed={playing}
      aria-label={`${playing ? "Stop" : "Play"} 30-second preview of ${label}`}
    >
      {playing ? "■ Stop preview" : "▶ 30 s preview"}
    </button>
  );
}

/** Required credit wherever previews play. */
export function PreviewCredit() {
  return <p className={s.small}>Previews courtesy of Apple Music.</p>;
}
