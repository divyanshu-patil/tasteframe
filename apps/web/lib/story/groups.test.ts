import { expect, it } from "vitest";
import { LAYOUT_GROUPS } from "./groups";
import { TEMPLATE_IDS } from "./types";

it("every layout is in exactly one picker group", () => {
  const all = LAYOUT_GROUPS.flatMap((g) => g.ids);
  expect(new Set(all).size).toBe(all.length);
  expect(new Set(all)).toEqual(new Set(TEMPLATE_IDS));
});
