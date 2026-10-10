"use client";

import { useEffect, useState } from "react";
import type { Photo } from "../lib/story/draw";
import { modnetMask } from "../lib/story/ml";
import { personMask } from "../lib/story/segment";
import type { Mask } from "../lib/story/templates";

/**
 * Person masks for `photos`, computed in the browser only when a layout needs a cutout. The
 * selfie model answers first (instant, 0.24 MB); with `fine`, MODNet then replaces each mask
 * with a finer one once it has downloaded (keeping the selfie mask if it fails).
 */
export function useMasks(photos: Photo | Photo[], needed: boolean, fine = false): (Mask | null)[] | undefined {
  const list = Array.isArray(photos) ? photos : [photos];
  const [masks, setMasks] = useState<{ for: Photo[]; masks: (Mask | null)[] } | null>(null);
  const key = list.length;
  useEffect(() => {
    if (!needed) return;
    let live = true;
    void Promise.all(list.map((p) => personMask(p))).then((first) => {
      if (!live) return;
      setMasks({ for: list, masks: first });
      if (fine)
        void Promise.all(list.map((p, i) => modnetMask(p).then((m) => m ?? first[i] ?? null))).then(
          (better) => live && setMasks({ for: list, masks: better }),
        );
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- photos are stable objects per Story
  }, [needed, fine, key, ...list]);
  return needed && masks && masks.for.length === list.length && masks.for.every((p, i) => p === list[i]) ? masks.masks : undefined;
}
