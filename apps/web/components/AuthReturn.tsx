"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/auth";

/**
 * Finishes sign-in when someone arrives from a Supabase email link (tokens in the URL hash, or
 * an error such as an expired link), removes them from the address bar and says what happened.
 */
export function AuthReturn() {
  const [note, setNote] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);
    const fromLink = hash.has("access_token") || hash.has("error_description") || query.has("error_description");
    if (!fromLink) return;
    const sb = supabase();
    const clean = () => window.history.replaceState(null, "", window.location.pathname);
    const err = hash.get("error_description") || query.get("error_description");
    if (err || !sb) {
      clean();
      setNote({ kind: "error", text: err ? `${err.replace(/\+/g, " ")}. Log in again, or sign up for a new link.` : "Login isn't available on this deployment." });
      return;
    }
    // Creating the client reads the tokens from the hash and stores the session.
    void sb.auth.getSession().then(({ data }) => {
      clean();
      setNote(data.session ? { kind: "ok", text: `Email confirmed. You're signed in as ${data.session.user.email ?? "your account"}.` } : { kind: "error", text: "That link didn't sign you in. Try logging in." });
    });
  }, []);

  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 8000);
    return () => clearTimeout(t);
  }, [note]);

  if (!note) return null;
  return (
    <div role="status" style={{
      position: "fixed", left: "50%", bottom: 24, transform: "translateX(-50%)", zIndex: 50, maxWidth: "calc(100vw - 32px)",
      padding: "12px 18px", borderRadius: 4, background: note.kind === "ok" ? "var(--color-ink-black)" : "var(--color-ember-orange)",
      color: "var(--color-parchment)", fontSize: 15, boxShadow: "var(--shadow-sm)", display: "flex", gap: 14, alignItems: "center",
    }}>
      <span>{note.text}</span>
      {note.kind === "ok" && <a href="/create" style={{ color: "inherit" }}>Open the studio</a>}
      <button type="button" onClick={() => setNote(null)} aria-label="Dismiss" style={{ background: "none", border: 0, color: "inherit", cursor: "pointer", fontSize: 18 }}>×</button>
    </div>
  );
}
