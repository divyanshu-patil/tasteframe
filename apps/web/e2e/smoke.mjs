/* global process */
/* eslint-disable turbo/no-undeclared-env-vars -- e2e-only knobs, not build inputs */
// Browser smoke test of the full guest flow against a running `pnpm dev`.
// Uses an installed Chrome (no browser download): CHROME_PATH=... pnpm --filter web e2e
// Checks: landing → /create → sample photo → mood → generate → results → edit → PNG export
// (1080×1920) for every template, login-to-save, on desktop and a 390px touch viewport, with zero
// console errors. With accounts configured, guests only get the top three as-is: shuffle, edits and
// other layouts ask to log in. Set E2E_EMAIL/E2E_PASSWORD (a confirmed test account) to log in
// there and run the full flow (every template, save loop).
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
  const btn = sec.getByRole("button", { name: new RegExp(`^${name.replace(/[+]/g, "\\+")}( suggested| needs login)?$`) }).first();
  for (const g of await sec.locator("details").all()) {
    if (await btn.isVisible()) break;
    if (!(await g.evaluate((d) => d.open))) await g.locator("summary").click();
  }
  await btn.click();
}

/** The login dialog opened for `reason`: dismiss it. */
async function notNow(page, reason) {
  const dialog = page.getByRole("dialog");
  await dialog.getByText(reason).waitFor();
  await dialog.getByRole("button", { name: "Not now" }).click();
  await dialog.waitFor({ state: "hidden" });
}

async function logIn(page) {
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Email").fill(process.env.E2E_EMAIL);
  await dialog.getByLabel(/^Password/).fill(process.env.E2E_PASSWORD ?? "");
  await dialog.getByRole("button", { name: "Log in", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
}

async function exportPng(page, path) {
  const [dl] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download PNG" }).click(),
  ]);
  await dl.saveAs(path);
  const [w, h] = pngSize(path);
  if (w !== 1080 || h !== 1920) throw new Error(`${path}: exported ${w}×${h}`);
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
  // MediaPipe (person cutouts) logs an informational TFLite line through console.error.
  const BENIGN = /Created TensorFlow Lite XNNPACK delegate/;
  page.on("console", (m) => m.type() === "error" && !BENIGN.test(m.text()) && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    const accounts = (await (await page.request.get(`${BASE}/api/v1/features`)).json()).saved_stories;
    const creds = Boolean(process.env.E2E_EMAIL);
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
    const shown = async () => (await page.locator("ol h3").allInnerTexts()).join();
    const firstSet = await shown();
    const shuffle = page.getByRole("button", { name: /Shuffle/ });
    if (accounts) {
      // Guests: the top three download as they are; shuffle, edits and other layouts need a login.
      await shuffle.click();
      await notNow(page, "Log in to shuffle");
      if ((await shown()) !== firstSet) throw new Error("guest shuffled without logging in");
      await page.getByRole("button", { name: "Edit this Story" }).first().click();
      await exportPng(page, `${OUT}/${name}-guest.png`);
      await page.locator("[aria-label='Select an element']").getByRole("button", { name: "Headline", exact: true }).click();
      await page.getByLabel("Words").first().fill("still so young.");
      await notNow(page, "Log in to edit");
      if ((await page.getByLabel("Words").first().inputValue()) === "still so young.") throw new Error("guest edit went through");
      await pickLayout(page, TEMPLATES.find((t) => !firstSet.includes(t)));
      await notNow(page, "Log in to use the");
      await page.getByRole("button", { name: "Log in to save" }).click();
      await notNow(page, "Log in to save this Story");
      if (!creds) {
        if (errors.length) throw new Error(`console errors: ${errors.join(" | ")}`);
        console.log(`✓ ${name}: guest gates (shuffle, edit, other layouts, save) + free export; set E2E_EMAIL for the full flow`);
        return;
      }
      await page.getByRole("button", { name: "All suggestions" }).click();
      await shuffle.click();
      await logIn(page); // the shuffle resumes after login
    } else await shuffle.click();
    for (let i = 0; (await shown()) === firstSet; i++) {
      if (i > 50) throw new Error("shuffle didn't change layouts");
      await page.waitForTimeout(100);
    }
    // Songs arrive after the layouts; each layout shows its own, and the editor names that song.
    await page.getByText("finding a song").first().waitFor({ state: "detached", timeout: 60_000 });
    const songs = await page.locator("ol li p", { hasText: /^♪ / }).allInnerTexts();
    if (songs.length && new Set(songs).size !== songs.length) throw new Error(`layouts share a song: ${songs}`);
    await page.screenshot({ path: `${OUT}/${name}-songs.png`, fullPage: true });
    await page.getByRole("button", { name: "Edit this Story" }).first().click();
    if (songs.length) {
      const title = songs[0].replace(/^♪ /, "").split(" — ")[0];
      await page.getByText("Song for this Story:").filter({ hasText: title }).waitFor({ timeout: 5_000 });
      await page.screenshot({ path: `${OUT}/${name}-editor-song.png` });
    }
    // Select the headline (inspector) and edit it; add a sticker from the collapsed section.
    await page.locator("[aria-label='Select an element']").getByRole("button", { name: "Headline", exact: true }).click();
    await page.getByLabel("Words").first().fill("still so young.");
    await openSection(page, "Stickers & elements");
    await page.getByRole("button", { name: "Gold star" }).click(); // a sticker rides along every export
    for (const tpl of TEMPLATES) {
      await pickLayout(page, tpl);
      await exportPng(page, `${OUT}/${name}-${tpl.replace(/ /g, "")}.png`);
    }
    // Saving to the backend (signed in above).
    if (accounts) {
      await page.getByRole("button", { name: "Save to my Stories" }).click();
      await page.getByRole("button", { name: "Saved ✓" }).waitFor();
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
    if (errors.length) throw new Error(`console errors: ${errors.join(" | ")}`);
    console.log(`✓ ${name}: ${TEMPLATES.length} exports at 1080×1920, no console errors`);
  } finally {
    await browser.close();
  }
}

await run("desktop", { viewport: { width: 1440, height: 1000 } });
await run("mobile", { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
