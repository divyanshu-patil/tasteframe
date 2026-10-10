// What's selected on the Story in the editor — drives the inspector and canvas highlight.
import type { TextKey } from "./types";

export type Selection =
  | { kind: "text"; key: TextKey }
  | { kind: "sticker"; id: string }
  | { kind: "slot"; i: number }
  | { kind: "view"; key: string }
  | { kind: "box"; key: string }
  | { kind: "spot" }
  | { kind: "cover" }
  | null;

export const sameSelection = (a: Selection, b: Selection) => JSON.stringify(a) === JSON.stringify(b);
