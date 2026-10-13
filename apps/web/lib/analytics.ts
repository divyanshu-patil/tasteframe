// Privacy-friendly usage analytics. A random visitor id lives in this browser only (hashed again
// on the server); no cookies, IPs or full URLs. Signed-in users' events are tied to their account
// (admin "Users" tab); guests stay anonymous. Do Not Track / Global Privacy Control turn it off
// entirely, and the admin dashboard itself is never tracked.
import { accessToken } from "./auth";
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

// In-app browsers that announce themselves in the user agent.
const IN_APP: [RegExp, string][] = [
  [/Instagram/, "instagram"],
  [/FBAN|FBAV|FB_IAB/, "facebook"],
  [/WhatsApp/i, "whatsapp"],
  [/Snapchat/, "snapchat"],
  [/LinkedInApp/, "linkedin"],
  [/Telegram/i, "telegram"],
  [/\bLine\//, "line"],
];

/**
 * Where this visit came from (never our own pages): a `?utm_source=` / `?ref=` tag, the app that
 * opened the link (Android sends `android-app://com.whatsapp/`, whose URL origin is "null"), an
 * in-app browser, or the referring site's origin. iOS WhatsApp sends nothing — tag shared links.
 */
export function externalReferrer(): string | undefined {
  try {
    const q = new URLSearchParams(location.search);
    const tag = (q.get("utm_source") ?? q.get("ref"))?.trim().toLowerCase();
    if (tag && /^[a-z0-9_-]{2,40}$/.test(tag)) return tag;
    const r = document.referrer ? new URL(document.referrer) : null;
    if (r?.protocol === "android-app:") return `android-app://${r.host}`;
    if (r && r.host !== location.host) return r.origin;
    return IN_APP.find(([re]) => re.test(navigator.userAgent))?.[1];
  } catch {
    return undefined;
  }
}

export function track(type: EventType, extra: { path?: string; referrer?: string; layout?: TemplateId } = {}): void {
  if (!trackingAllowed()) return;
  const body = JSON.stringify({ type, visitor: visitorId(), device: device(), ...extra });
  // keepalive lets exports/navigation-time events finish; failures are ignored on purpose.
  void accessToken()
    .catch(() => null)
    .then((token) => {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      return fetch(`${API}/v1/events`, { method: "POST", headers, body, keepalive: true });
    })
    .catch(() => undefined); // analytics never breaks the app
}
