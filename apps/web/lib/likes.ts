// Layout likes shared by every like button: loaded once, updated optimistically, reloaded when
// someone signs in or out (likes follow the account when signed in, this browser otherwise).
import { useEffect, useSyncExternalStore } from "react";
import { type Likes, getLikes, setLike } from "./api";
import { visitorId } from "./analytics";
import { supabase } from "./auth";
import type { TemplateId } from "./story/types";

const EMPTY: Likes = { enabled: false, counts: {}, liked: [], fresh: [] };
let state: Likes = EMPTY;
let loading: Promise<void> | null = null;
let watching = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => subs.delete(f);
};

export function loadLikes(force = false): Promise<void> {
  if (loading && !force) return loading;
  if (!watching) {
    watching = true;
    supabase()?.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") void loadLikes(true);
    });
  }
  loading = getLikes(visitorId())
    .then((l) => {
      state = l;
      emit();
    })
    .catch(() => undefined); // likes are optional: keep whatever we had
  return loading;
}

export function useLikes(): Likes {
  useEffect(() => void loadLikes(), []);
  return useSyncExternalStore(subscribe, () => state, () => EMPTY);
}

export async function toggleLike(id: TemplateId): Promise<void> {
  const before = state;
  const on = !state.liked.includes(id);
  state = {
    ...state,
    liked: on ? [...state.liked, id] : state.liked.filter((x) => x !== id),
    counts: { ...state.counts, [id]: Math.max(0, (state.counts[id] ?? 0) + (on ? 1 : -1)) },
  };
  emit();
  try {
    const n = await setLike(id, visitorId(), on);
    state = { ...state, counts: { ...state.counts, [id]: n } };
  } catch {
    state = before; // e.g. rate-limited or offline: undo
  }
  emit();
}
