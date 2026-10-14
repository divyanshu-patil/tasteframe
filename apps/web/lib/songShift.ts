// Which suggested song leads, per analysis: the player's pick/shuffle. Layout k (by rank) gets
// song (k + shift), so the chosen song goes on the best layout and the editor follows too.
import { useSyncExternalStore } from "react";

let state: { id: string | null; shift: number } = { id: null, shift: 0 };
const listeners = new Set<() => void>();

export function songShift(analysisId: string | undefined): number {
  return analysisId && state.id === analysisId ? state.shift : 0;
}

export function setSongShift(analysisId: string, shift: number): void {
  state = { id: analysisId, shift };
  listeners.forEach((f) => f());
}

export function useSongShift(analysisId: string | undefined): number {
  return useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => songShift(analysisId),
    () => 0,
  );
}
