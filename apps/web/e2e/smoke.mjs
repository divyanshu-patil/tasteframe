/* global process */
/* eslint-disable turbo/no-undeclared-env-vars -- e2e-only knobs, not build inputs */
// Browser smoke test of the full guest flow against a running `pnpm dev`.
// Uses an installed Chrome (no browser download): CHROME_PATH=... pnpm --filter web e2e
// Checks: sample photo → mood → generate → results → edit → PNG export (1080×1920) for every
// template, on desktop and a 390px touch viewport, with zero console errors.
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.env.E2E_URL ?? "http://localhost:3000";
const CHROME =
  process.env.CHROME_PATH ??
  (process.platform === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : "/usr/bin/google-chrome");
const OUT = process.env.E2E_OUT ?? "e2e/.output";
const TEMPLATES = ["Film Stills", "Journal", "Scrapbook", "Film Strip", "Vintage", "Minimal", "Editorial", "Cinematic"];
mkdirSync(OUT, { recursive: true });

const pngSize = (path) => {
  const b = readFileSync(path);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};

async function run(name, contextOptions) {
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await (await browser.newContext(contextOptions)).newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /sample dusk/ }).click();
    await page.getByRole("button", { name: "nostalgic" }).click();
    await page.getByRole("button", { name: "Create my Stories" }).click();
    await page.getByText("Three Stories for this photo").waitFor({ timeout: 20_000 });
    await page.screenshot({ path: `${OUT}/${name}-results.png`, fullPage: true });
    await page.getByRole("button", { name: "Edit this Story" }).first().click();
    await page.getByLabel("Words").fill("still so young.");
    for (const tpl of TEMPLATES) {
      await page.getByRole("button", { name: tpl }).filter({ hasText: tpl }).first().click();
      const [dl] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("button", { name: "Download PNG" }).click(),
      ]);
      const path = `${OUT}/${name}-${tpl.replace(/ /g, "")}.png`;
      await dl.saveAs(path);
      const [w, h] = pngSize(path);
      if (w !== 1080 || h !== 1920) throw new Error(`${tpl}: exported ${w}×${h}`);
    }
    if (errors.length) throw new Error(`console errors: ${errors.join(" | ")}`);
    console.log(`✓ ${name}: ${TEMPLATES.length} exports at 1080×1920, no console errors`);
  } finally {
    await browser.close();
  }
}

await run("desktop", { viewport: { width: 1440, height: 1000 } });
await run("mobile", { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
