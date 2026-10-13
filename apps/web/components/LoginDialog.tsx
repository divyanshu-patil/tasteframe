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
            <button
              type="button"
              className={s.secondary}
              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 10 }}
              onClick={() => void google()}
              disabled={state.kind === "busy"}
            >
              <GoogleLogo />
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

/** Google's standard multicolour "G" (sign-in button branding). */
function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
