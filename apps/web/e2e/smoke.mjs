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
/** Open a collapsible editor section by its title. */
async function openSection(page, title) {
  const sec = page.locator("details", { has: page.locator("summary", { hasText: new RegExp(`^${title}`) }) }).first();
  if (!(await sec.evaluate((d) => d.open))) await sec.locator("summary").first().click();
  return sec;
}

/** Choose a layout in the grouped, collapsible picker. */
async function pickLayout(page, name) {
  const sec = await openSection(page, "Layout");
  const btn = sec.getByRole("button", { name: new RegExp(`^${name.replace(/[+]/g, "\\+")}( suggested)?$`) }).first();
  for (const g of await sec.locator("details").all()) {
    if (await btn.isVisible()) break;
    if (!(await g.evaluate((d) => d.open))) await g.locator("summary").click();
  }
  await btn.click();
}

const TEMPLATES = [
  "Film Stills", "Journal", "Scrapbook", "Film Strip", "Vintage", "Minimal", "Editorial", "Cinematic",
  "Photo Dump", "Magazine", "Now Playing", "Vinyl", "Mood Board", "Ticket", "Y2K Chrome", "Torn Reveal",
  "Paper Note", "Newspaper", "Soft Focus", "Colour Box", "Torn Strip", "Playlist", "WhatsApp Screen", "Night Cam", "Song on Lips",
];
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
    // Shuffle shows three different layouts.
    const firstSet = (await page.locator("ol h3").allInnerTexts()).join();
    await page.getByRole("button", { name: /Shuffle/ }).click();
    if ((await page.locator("ol h3").allInnerTexts()).join() === firstSet) throw new Error("shuffle didn't change layouts");
    await page.getByRole("button", { name: "Edit this Story" }).first().click();
    // Select the headline (inspector) and edit it; add a sticker from the collapsed section.
    await page.locator("[aria-label='Select an element']").getByRole("button", { name: "Headline", exact: true }).click();
    await page.getByLabel("Words").first().fill("still so young.");
    await openSection(page, "Stickers & elements");
    await page.getByRole("button", { name: "Gold star" }).click(); // a sticker rides along every export
    for (const tpl of TEMPLATES) {
      await pickLayout(page, tpl);
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
