"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/auth";

/**
 * Finishes Google sign-in and email-confirmation links: supabase-js reads the tokens from the URL and stores the session, which
 * the original tab picks up. In the popup we then close; after a full-page redirect we go on to
 * the studio.
 */
export function OAuthCallback() {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search);
    const err = params.get("error_description");
    const sb = supabase();
    if (err || !sb) {
      setError(err ? err.replace(/\+/g, " ") : "Login isn't available on this deployment.");
      return;
    }
    void sb.auth.getSession().then(({ data }) => {
      if (!data.session) return setError("That didn't sign you in. Close this window and try again.");
      if (window.opener) window.close();
      else window.location.replace("/create");
    });
  }, []);
  return (
    <main style={{ padding: 32, fontSize: 16 }} role="status">
      {error ?? "Signing you in…"}
    </main>
  );
}
