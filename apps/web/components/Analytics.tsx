"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { externalReferrer, track } from "../lib/analytics";

/** Page-view tracking for the public pages (the admin dashboard is excluded). */
export function Analytics() {
  const path = usePathname();
  const first = useRef(true);
  useEffect(() => {
    if (!path || path.startsWith("/admin")) return;
    const clean = path.toLowerCase().slice(0, 60);
    if (!/^\/[a-z0-9/_-]*$/.test(clean)) return;
    // The referring site only matters for the page someone landed on.
    track("pageview", { path: clean, referrer: first.current ? externalReferrer() : undefined });
    first.current = false;
  }, [path]);
  return null;
}
