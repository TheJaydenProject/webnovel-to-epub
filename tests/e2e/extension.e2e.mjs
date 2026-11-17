// End-to-end test: loads the unpacked extension into Chromium, points it at a
// local fake novel site, and checks the EPUB it produces.
//
// Setup (once):  cd tests/e2e && npm install && npm run setup
// Run:           npm test            (HEADED=1 npm test to watch it)
//
// Branded Google Chrome ignores --load-extension since version 137, so this
// uses Playwright's Chromium. Override with CHROMIUM_PATH, or point
// PLAYWRIGHT_CORE at an existing playwright-core folder to skip the install.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir, homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const extensionDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const { chromium } = process.env.PLAYWRIGHT_CORE ? require(process.env.PLAYWRIGHT_CORE) : require("playwright-core");

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const root = process.platform === "win32"
    ? join(process.env.LOCALAPPDATA || "", "ms-playwright")
    : join(homedir(), process.platform === "darwin" ? "Library/Caches/ms-playwright" : ".cache/ms-playwright");
  const builds = existsSync(root) ? readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse() : [];
  for (const build of builds) {
    for (const exe of ["chrome-win64/chrome.exe", "chrome-win/chrome.exe", "chrome-linux/chrome",
      "chrome-mac/Chromium.app/Contents/MacOS/Chromium"]) {
      if (existsSync(join(root, build, exe))) return join(root, build, exe);
    }
  }
  return undefined; // let Playwright use its default
}

// ── Fake novel site ─────────────────────────────────────────────────────────
const NOVEL = "E2E Test Novel";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const prose = (marker) => `<p>${marker}</p>` + `<p>${"The lantern light swayed over the river as the ferry pushed on through the dark water. ".repeat(4)}</p>`;
const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title} - ${NOVEL}</title></head><body>${body}</body></html>`;
const requests = [];

const site = createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  requests.push(url.pathname + url.search);
  const html = (status, body) => res.writeHead(status, { "content-type": "text/html; charset=utf-8" }).end(body);
  switch (url.pathname) {
    case "/novel":
      return html(200, `<!doctype html><title>${NOVEL}</title><meta property="og:image" content="/img/cover"><h1>${NOVEL}</h1>`);
    case "/c/1":
      // Copy-protected reader: text exists only inside a closed shadow root.
      return html(200, page("Chapter 1: Shadow", `<div id="viewer-1"></div>
        <script>document.getElementById("viewer-1").attachShadow({ mode: "closed" }).innerHTML = ${JSON.stringify(prose("SHADOW-TEXT-ONE"))};</script>
        <a href="/c/2">Next chapter</a>`));
    case "/c/2":
      // Cloudflare-style interstitial until the "user" passes it, then late-rendered text.
      if (!/cleared=1/.test(req.headers.cookie || "")) {
        return html(403, `<!doctype html><title>Just a moment...</title><div id="challenge-stage">
          <button id="verify" onclick="document.cookie='cleared=1; path=/'; location.reload()">Verify you are human</button></div>`);
      }
      return html(200, page("Chapter 2: Late", `<div class="chapter-content"></div>
        <script>setTimeout(() => { document.querySelector(".chapter-content").innerHTML = ${JSON.stringify(prose("LATE-TEXT-TWO"))}; }, 1500);</script>
        <a href="/c/3">다음화</a>`));
    case "/c/3":
      // Icon-only next button; the Korean "previous" link must not be followed.
      return html(200, page("Chapter 3: Icon", `<div class="chapter-content">${prose("ICON-TEXT-THREE")}</div>
        <a href="/c/2">이전화</a><a id="next_move" href="/c/4" aria-label="Next"><svg width="12" height="12"></svg></a>`));
    case "/c/4":
      // Image mislabelled as a font; "next" re-serves this same chapter.
      return html(200, page("Chapter 4: Last", `<div class="chapter-content">${prose("LAST-TEXT-FOUR")}<p><img src="/img/pic" alt="Map"></p></div>
        <a href="/c/4?again=1">Next</a>`));
    case "/img/pic":
      return res.writeHead(200, { "content-type": "font/woff" }).end(PNG);
    case "/img/cover":
      return res.writeHead(200, { "content-type": "image/png" }).end(PNG);
    default:
      return res.writeHead(404).end();
  }
}).listen(0, "127.0.0.1");
await new Promise((resolve) => site.once("listening", resolve));
const base = `http://127.0.0.1:${site.address().port}`;

// ── Browser with the extension ──────────────────────────────────────────────
const profile = await mkdtemp(join(tmpdir(), "wn2epub-profile-"));
const downloads = await mkdtemp(join(tmpdir(), "wn2epub-downloads-"));
const context = await chromium.launchPersistentContext(profile, {
  executablePath: findChromium(),
  headless: process.env.HEADED !== "1",
  acceptDownloads: true,
  downloadsPath: downloads,
  args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
});

let failure;
try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  const extensionId = new URL(worker.url()).host;
  const dashboard = await context.newPage();
  const errors = [];
  dashboard.on("pageerror", (err) => errors.push(err.message));
  await dashboard.goto(`chrome-extension://${extensionId}/ui/main.html`);

  // Play the user: pass the verification check only after the extension asks for it.
  let challengeSeen = false;
  context.on("page", async (tab) => {
    try {
      await tab.waitForLoadState("load");
      if (!tab.url().endsWith("/c/2") || (await tab.title()) !== "Just a moment...") return;
      challengeSeen = true;
      await dashboard.waitForFunction(() => document.getElementById("log").textContent.includes("verification check"), null, { timeout: 30000 });
      await tab.click("#verify");
    } catch {
      // Tabs the extension closes mid-check are expected.
    }
  });

  // Keep the generated EPUB in memory for inspection.
  await dashboard.evaluate(() => {
    const create = URL.createObjectURL;
    URL.createObjectURL = (blob) => { window.__epub = blob; return create(blob); };
  });
  await dashboard.fill("#tocUrl", `${base}/novel`);
  await dashboard.fill("#firstChapterUrl", `${base}/c/1`);
  assert.equal(await dashboard.isChecked("#useTabFetch"), true, "tab fetching is on by default");
  assert.equal(await dashboard.isChecked("#autoCompile"), true, "auto-compile is on by default");
  await dashboard.click("#loadBtn");

  await dashboard.waitForFunction(() => {
    const result = document.getElementById("compileResult");
    return !result.hidden && result.dataset.outcome;
  }, null, { timeout: 150000 });

  const outcome = await dashboard.evaluate(() => ({
    outcome: document.getElementById("compileResult").dataset.outcome,
    title: document.getElementById("resultTitle").textContent,
    counts: document.getElementById("resultCounts").textContent,
    issues: [...document.querySelectorAll("#resultIssues li")].map((li) => li.textContent),
    selection: document.getElementById("selectionCount").textContent,
    tabTitle: document.title,
    showFile: !document.getElementById("showFileBtn").hidden,
    log: document.getElementById("log").textContent,
  }));
  if (outcome.outcome !== "success") console.log(outcome.log);
  assert.deepEqual(outcome.issues, [], "no warnings or failures");
  assert.equal(outcome.outcome, "success", outcome.title);
  assert.match(outcome.counts, /4 of 4 selected chapters included\. 1 of 1 chapter images included\. File: E2E Test Novel\.epub/);
  assert.equal(outcome.selection, "4 of 4 selected");
  assert.match(outcome.tabTitle, /^Done · /);
  assert.equal(outcome.showFile, true, "Show in folder offered after a download");
  assert.equal(challengeSeen, true, "the fake site served its verification check");
  assert.match(outcome.log, /Verification passed/);
  assert.match(outcome.log, /Same content as the previous chapter/);
  // Auto-compile keeps the discovery log, so Copy log covers the whole run.
  assert.match(outcome.log, /Discovering chapter 1: [\s\S]*Fetching cover image/);
  assert.deepEqual(errors, [], "no uncaught errors on the dashboard");

  const epub = await dashboard.evaluate(async () => {
    const zip = await JSZip.loadAsync(window.__epub);
    const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir).sort();
    const read = (name) => zip.file(name).async("string");
    const chapters = [];
    for (const name of names.filter((n) => /^OEBPS\/text\/chapter\d+\.xhtml$/.test(n))) chapters.push(await read(name));
    const images = names.filter((n) => n.startsWith("OEBPS/images/"));
    const bytes = await zip.file(images.find((n) => !n.includes("cover"))).async("uint8array");
    return { names, chapters, images, opf: await read("OEBPS/content.opf"), firstBytes: [...bytes.slice(0, 4)], mimetype: await read("mimetype") };
  });
  assert.equal(epub.mimetype, "application/epub+zip");
  assert.equal(epub.chapters.length, 4, "the repeated last chapter is not added twice");
  for (const [i, marker] of ["SHADOW-TEXT-ONE", "LATE-TEXT-TWO", "ICON-TEXT-THREE", "LAST-TEXT-FOUR"].entries()) {
    assert.ok(epub.chapters[i].includes(marker), `chapter ${i + 1} contains ${marker}`);
  }
  assert.match(epub.chapters[0], /<h1>Chapter 1: Shadow<\/h1>/);
  assert.match(epub.chapters[3], /<img src="\.\.\/images\/img0001\.png" alt="Map" ?\/>/, "disguised image packaged as PNG");
  assert.deepEqual(epub.firstBytes, [0x89, 0x50, 0x4e, 0x47]);
  assert.ok(epub.images.includes("OEBPS/images/cover.png"), "cover packaged");
  assert.match(epub.opf, new RegExp(`<dc:title>${NOVEL}</dc:title>`));
  assert.match(epub.opf, new RegExp(`<dc:source>${base}/novel</dc:source>`));

  const saved = await readdir(downloads);
  assert.equal(saved.length, 1, "the browser saved exactly one download");
  console.log(`Extension end-to-end checks passed: shadow DOM, verification hand-off, late render, icon/Korean next links, repeat detection, disguised image, cover, download (${requests.length} site requests).`);
} catch (err) {
  failure = err;
} finally {
  await context.close();
  site.close();
  await rm(profile, { recursive: true, force: true }).catch(() => {});
  await rm(downloads, { recursive: true, force: true }).catch(() => {});
}
if (failure) {
  console.error(failure);
  process.exit(1);
}
