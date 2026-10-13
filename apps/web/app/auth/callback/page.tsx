import type { Metadata } from "next";
import { OAuthCallback } from "../../../components/OAuthCallback";

export const metadata: Metadata = { title: "Signing in — Tasteframe", robots: { index: false } };

/** Google (Supabase OAuth) returns here, usually inside the login popup. */
export default function AuthCallbackPage() {
  return <OAuthCallback />;
}
