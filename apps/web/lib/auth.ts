"use client";

// Supabase Auth in the browser (publishable key — designed to be public). Login is only needed
// to SAVE Stories; creating and exporting work without an account.
import { type SupabaseClient, type User, createClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

let client: SupabaseClient | null | undefined;

/** null when auth isn't configured for this deployment. */
export function supabase(): SupabaseClient | null {
  if (client === undefined) {
    client = URL_ && KEY ? createClient(URL_, KEY, { auth: { persistSession: true, autoRefreshToken: true } }) : null;
  }
  return client;
}

export const authConfigured = Boolean(URL_ && KEY);

/** Current access token (refreshed by supabase-js), or null when signed out. */
export async function accessToken(): Promise<string | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.access_token ?? null;
}

export function useAuth(): { user: User | null; ready: boolean } {
  const [state, setState] = useState<{ user: User | null; ready: boolean }>({ user: null, ready: !authConfigured });
  useEffect(() => {
    const sb = supabase();
    if (!sb) return;
    void sb.auth.getSession().then(({ data }) => setState({ user: data.session?.user ?? null, ready: true }));
    const { data } = sb.auth.onAuthStateChange((_event, session) =>
      setState({ user: session?.user ?? null, ready: true }),
    );
    return () => data.subscription.unsubscribe();
  }, []);
  return state;
}

export type AuthResult = { ok: true } | { ok: false; error: string } | { ok: "confirm" };

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const sb = supabase();
  if (!sb) return { ok: false, error: "Login isn't available on this deployment." };
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (!error) return { ok: true };
  return { ok: false, error: error.message.includes("Email not confirmed") ? "Confirm your email first — check your inbox." : "Wrong email or password." };
}

export async function signUp(email: string, password: string): Promise<AuthResult> {
  const sb = supabase();
  if (!sb) return { ok: false, error: "Sign-up isn't available on this deployment." };
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${window.location.origin}/create` },
  });
  if (error) return { ok: false, error: error.message };
  // With "Confirm email" on, Supabase returns a user but no session until the link is clicked.
  return data.session ? { ok: true } : { ok: "confirm" };
}

export async function signOut(): Promise<void> {
  await supabase()?.auth.signOut();
}
