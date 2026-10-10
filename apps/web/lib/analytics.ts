// Anonymous, privacy-friendly usage analytics. A random visitor id lives in this browser only
// (hashed again on the server); no cookies, IPs, user ids or full URLs. Do Not Track / Global
// Privacy Control turn it off entirely, and the admin dashboard itself is never tracked.
import type { TemplateId } from "./story/types";

type EventType = "pageview" | "analysis" | "layout_open" | "export" | "save" | "request" | "gallery_pick";
const API = "/api";
const KEY = "tf_visitor";

export function trackingAllowed(): boolean {
  if (typeof navigator === "undefined") return false;
  const n = navigator as Navigator & { globalPrivacyControl?: boolean };
  return n.doNotTrack !== "1" && n.globalPrivacyControl !== true;
}

export function visitorId(): string {
  try {
    let v = localStorage.getItem(KEY);
    if (!v || !/^[A-Za-z0-9_-]{8,64}$/.test(v)) {
      v = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(36).padStart(2, "0")).join("");
      localStorage.setItem(KEY, v);
    }
    return v;
  } catch {
    return "anonymous0"; // storage blocked: still counted, just not as a unique visitor
  }
}

export function device(): "mobile" | "tablet" | "desktop" {
  const w = typeof window === "undefined" ? 1200 : window.innerWidth;
  return w < 768 ? "mobile" : w < 1100 ? "tablet" : "desktop";
}

/** The referring site, only when it's another site (never our own pages). */
export function externalReferrer(): string | undefined {
  try {
    const r = document.referrer ? new URL(document.referrer) : null;
    return r && r.host !== location.host ? r.origin : undefined;
  } catch {
    return undefined;
  }
}

export function track(type: EventType, extra: { path?: string; referrer?: string; layout?: TemplateId } = {}): void {
  if (!trackingAllowed()) return;
  const body = JSON.stringify({ type, visitor: visitorId(), device: device(), ...extra });
  try {
    // keepalive lets exports/navigation-time events finish; failures are ignored on purpose.
    void fetch(`${API}/v1/events`, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => undefined);
  } catch {
    /* analytics never breaks the app */
  }
}
