// Keeps a signed-in person's current Story (photos, analysis, edits) in this browser's IndexedDB
// so a page refresh brings it back. One snapshot, tagged with the account id; cleared on start
// over and on sign-out. Photos never leave the device this way (the server copy is unchanged).
import type { Analysis } from "./api";
import type { StoryState } from "./story/types";

export interface ResumeSnapshot {
  userId: string;
  photos: { blob: Blob; type: string; name: string }[];
  objectKeys: string[] | null;
  analysis: Analysis | null;
  story: StoryState | null;
  phase: "results" | "edit";
  storyDate: string;
  savedAt: number;
}

const DB = "tasteframe";
const STORE = "resume";
const KEY = "current";
const MAX_AGE_MS = 7 * 24 * 3600 * 1000; // uploads expire server-side too

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

/** Storage problems (private mode, quota) only mean nothing is restored. */
export async function saveResume(snap: ResumeSnapshot): Promise<void> {
  try {
    await run("readwrite", (s) => s.put(snap, KEY));
  } catch {
    // ignore
  }
}

export async function loadResume(userId: string): Promise<ResumeSnapshot | null> {
  try {
    const snap = (await run("readonly", (s) => s.get(KEY))) as ResumeSnapshot | undefined;
    if (!snap || snap.userId !== userId || Date.now() - snap.savedAt > MAX_AGE_MS || !snap.photos?.length) return null;
    return snap;
  } catch {
    return null;
  }
}

export async function clearResume(): Promise<void> {
  try {
    await run("readwrite", (s) => s.delete(KEY));
  } catch {
    // ignore
  }
}
