"use client";

import { useEffect, useState } from "react";
import type { Photo } from "../lib/story/draw";
import { personMask } from "../lib/story/segment";
import type { Mask } from "../lib/story/templates";

/** Person masks for `photos`, computed in the browser only when a layout needs a cutout. */
export function useMasks(photos: Photo | Photo[], needed: boolean): (Mask | null)[] | undefined {
  const list = Array.isArray(photos) ? photos : [photos];
  const [masks, setMasks] = useState<{ for: Photo[]; masks: (Mask | null)[] } | null>(null);
  const key = list.length;
  useEffect(() => {
    if (!needed) return;
    let live = true;
    void Promise.all(list.map((p) => personMask(p))).then((m) => live && setMasks({ for: list, masks: m }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- photos are stable objects per Story
  }, [needed, key, ...list]);
  return needed && masks && masks.for.length === list.length && masks.for.every((p, i) => p === list[i]) ? masks.masks : undefined;
}
