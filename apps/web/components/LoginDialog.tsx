"use client";

import { useEffect, useRef, useState } from "react";
import { signIn, signInWithGoogle, signUp } from "../lib/auth";
import s from "./maker.module.css";

interface Props {
  open: boolean;
  /** Why we're asking, e.g. "Log in to save this Story to your account." */
  reason: string;
  onDone: (signedIn: boolean) => void;
}

/** Google or email + password login / sign-up (Supabase Auth) in a native modal <dialog>. */
export function LoginDialog({ open, reason, onDone }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<
    { kind: "idle" } | { kind: "busy" } | { kind: "error"; msg: string } | { kind: "confirm" }
  >({ kind: "idle" });

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setState({ kind: "idle" });
      d.showModal();
    } else if (!open && d.open) d.close();
  }, [open]);

  const google = async () => {
    setState({ kind: "busy" });
    const res = await signInWithGoogle();
    if (res.ok === true) onDone(true);
    else if (res.ok === false) setState({ kind: "error", msg: res.error });
    // "redirect": popups were blocked, so the page is moving to Google.
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState({ kind: "busy" });
    const res = mode === "signin" ? await signIn(email.trim(), password) : await signUp(email.trim(), password);
    if (res.ok === true) {
      setPassword("");
      onDone(true);
    } else if (res.ok === "confirm") setState({ kind: "confirm" });
    else setState({ kind: "error", msg: res.error });
  };

  return (
    <dialog ref={ref} className={s.dialog} onClose={() => open && onDone(false)} aria-labelledby="login-title">
      <form onSubmit={submit} className={s.dialogBody}>
        <p className={s.kicker}>{mode === "signin" ? "Log in" : "Create an account"}</p>
        <h2 id="login-title" className={s.dialogTitle}>
          {mode === "signin" ? "Welcome back." : "Keep your Stories."}
        </h2>
        <p className={s.small}>{reason}</p>

        {state.kind === "confirm" ? (
          <p role="status" className={s.notice}>
            Almost there — we sent a confirmation link to <strong>{email}</strong>. Open it, then
            log in here to save.
          </p>
        ) : (
          <>
            <button type="button" className={s.secondary} onClick={() => void google()} disabled={state.kind === "busy"}>
              {state.kind === "busy" ? "Finish in the Google window…" : "Continue with Google"}
            </button>
            <p className={s.small}>or with email</p>
            <label className={s.field}>
              <span>Email</span>
              <input className={s.input} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className={s.field}>
              <span>Password {mode === "signup" && <span className={s.muted}>(8+ characters)</span>}</span>
              <input
                className={s.input}
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                minLength={mode === "signup" ? 8 : undefined}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {state.kind === "error" && <p role="alert" className={s.error}>{state.msg}</p>}
            <button className={s.primary} disabled={state.kind === "busy"}>
              {state.kind === "busy" ? "One moment…" : mode === "signin" ? "Log in" : "Create account"}
            </button>
          </>
        )}

        <div className={s.row}>
          <button
            type="button"
            className={s.linkBtn}
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setState({ kind: "idle" });
            }}
          >
            {mode === "signin" ? "New here? Create an account" : "Have an account? Log in"}
          </button>
          <button type="button" className={s.linkBtn} onClick={() => onDone(false)}>
            Not now
          </button>
        </div>
      </form>
    </dialog>
  );
}
