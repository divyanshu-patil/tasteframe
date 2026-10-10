"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import s from "./maker.module.css";

type State = "connecting" | "up" | "down";
const GIVE_UP_MS = 90_000; // free hosting can take ~50 s to wake; allow some slack
const RETRY_MS = 3_000;
const RECHECK_MS = 60_000;

/**
 * A small dot: yellow (breathing) while the API wakes up, green when it answers, red if it
 * can't be reached. The free Render plan sleeps when idle, so the first visit can take ~50 s.
 */
export function BackendStatus() {
  const [state, setState] = useState<State>("connecting");
  const [waited, setWaited] = useState(0);
  const [tipOpen, setTipOpen] = useState(false); // tap to show on touch screens
  const started = useRef(Date.now());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const check = useCallback(async () => {
    try {
      const res = await fetch("/api/health", { cache: "no-store", signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(String(res.status));
      setState("up");
      started.current = Date.now();
      timer.current = setTimeout(check, RECHECK_MS);
    } catch {
      const elapsed = Date.now() - started.current;
      setState(elapsed > GIVE_UP_MS ? "down" : "connecting");
      if (elapsed <= GIVE_UP_MS) timer.current = setTimeout(check, RETRY_MS);
    }
  }, []);

  useEffect(() => {
    void check();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [check]);

  // Seconds counter for the "waking up" tooltip.
  useEffect(() => {
    if (state !== "connecting") return;
    const i = setInterval(() => setWaited(Math.round((Date.now() - started.current) / 1000)), 1000);
    return () => clearInterval(i);
  }, [state]);

  const onClick = () => {
    setTipOpen((v) => !v);
    if (state !== "down") return;
    started.current = Date.now();
    setState("connecting");
    void check();
  };

  const tip =
    state === "up"
      ? "Server is up. Everything's ready."
      : state === "down"
        ? "Can't reach the server right now. Click to try again."
        : `Waking up the server${waited ? ` (${waited}s)` : ""}. The free hosting plan sleeps when idle, so the first visit can take about 50 seconds.`;

  return (
    <span className={s.status}>
      <button type="button" className={`${s.statusDot} ${s[`status_${state}`]}`} onClick={onClick} onBlur={() => setTipOpen(false)} aria-describedby="backend-status-tip" aria-label={state === "up" ? "Server status: up" : state === "down" ? "Server status: unreachable. Retry" : "Server status: starting"} />
      <span id="backend-status-tip" role="status" className={`${s.statusTip} ${tipOpen ? s.statusTipOpen : ""}`}>{tip}</span>
      {state === "connecting" && <span className={s.statusLabel} aria-hidden>starting{waited ? ` ${waited}s` : "…"}</span>}
    </span>
  );
}
