/* global process */
/* eslint-disable turbo/no-undeclared-env-vars -- e2e-only knobs, not build inputs */
// Browser smoke test of the full guest flow against a running `pnpm dev`.
// Uses an installed Chrome (no browser download): CHROME_PATH=... pnpm --filter web e2e
// Checks: landing → /create → sample photo → mood → generate → results → edit → PNG export
// (1080×1920) for every template, login-to-save, on desktop and a 390px touch viewport, with zero
// console errors. Set E2E_EMAIL/E2E_PASSWORD (a confirmed test account) for the full save loop.
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
    // Landing page routes to the studio.
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.getByRole("link", { name: "Start creating" }).click();
    await page.waitForURL(`${BASE}/create`);
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
    // Saving to the backend requires login.
    const features = await (await page.request.get(`${BASE}/api/v1/features`)).json();
    if (features.saved_stories) {
      await page.getByRole("button", { name: "Log in to save" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByText("Log in to save this Story").waitFor();
      if (!process.env.E2E_EMAIL) {
        await dialog.getByRole("button", { name: "Not now" }).click();
        await page.getByRole("button", { name: "Log in to save" }).waitFor();
        console.log(`✓ ${name}: guest is asked to log in before saving`);
      } else {
        await dialog.getByLabel("Email").fill(process.env.E2E_EMAIL);
        await dialog.getByLabel(/^Password/).fill(process.env.E2E_PASSWORD ?? "");
        await dialog.getByRole("button", { name: "Log in", exact: true }).click();
        await page.getByRole("button", { name: "Saved ✓" }).waitFor(); // save resumes after login
        await page.getByRole("button", { name: "Start over", exact: true }).click();
        await page.getByRole("button", { name: "Open", exact: true }).first().click();
        await page.getByRole("button", { name: "Download PNG" }).waitFor();
        if ((await page.getByLabel("Words").inputValue()) !== "still so young.") throw new Error("saved text not restored");
        await page.getByRole("button", { name: "Start over", exact: true }).click();
        const opens = page.getByRole("button", { name: "Open", exact: true });
        await opens.first().waitFor();
        const before = await opens.count();
        await page.getByRole("button", { name: "Delete", exact: true }).first().click();
        for (let i = 0; (await opens.count()) !== before - 1; i++) {
          if (i > 50) throw new Error("saved Story was not deleted");
          await page.waitForTimeout(100);
        }
        await page.getByRole("button", { name: "Log out" }).click();
        console.log(`✓ ${name}: logged in, saved, reopened, deleted, logged out`);
      }
    }
    if (errors.length) throw new Error(`console errors: ${errors.join(" | ")}`);
    console.log(`✓ ${name}: ${TEMPLATES.length} exports at 1080×1920, no console errors`);
  } finally {
    await browser.close();
  }
}

await run("desktop", { viewport: { width: 1440, height: 1000 } });
await run("mobile", { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
