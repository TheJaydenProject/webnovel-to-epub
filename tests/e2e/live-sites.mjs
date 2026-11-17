// Live smoke test: runs the real extension against every supported site.
// Each site gets one dashboard run that compiles only its first 2 chapters,
// to keep load on the sites minimal. Uses a fresh profile with no logins.
//
// Each site is first checked with one plain request, so the verdict says
// whose fault a failure is:
//   PASS     2 clean chapters compiled
//   DOWN     site or novel page answers 5xx / DNS error (site's fault; not run)
//   GONE     site up but the sample novel is 404 (ours: pick a new sample)
//   BLOCKED  a check needs a person (unverified; rerun with HEADED=1)
//   LOGIN    every chapter needs an account (unverified; sign in, HEADED=1)
//   FAIL     site up but the extension failed (ours)
//   WARN     EPUB made but incomplete or thin (ours)
// Exits 1 only for our own failures. A Cloudflare/CAPTCHA check needing a
// person is stopped; this script never attempts to solve or evade them.
//
// Run: npm run live [-- site-id ...]      (HEADED=1 to watch)
// Results: printed table plus live-results.json next to this file.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir, homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { probe, classifyProbe, OUR_FAULT } from "./site-status.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const extensionDir = join(here, "..", "..");
const require = createRequire(import.meta.url);
const { chromium } = process.env.PLAYWRIGHT_CORE ? require(process.env.PLAYWRIGHT_CORE) : require("playwright-core");
const { SITE_CONFIGS } = await import(pathToFileURL(join(extensionDir, "core", "ParserRegistry.js")).href);

const CHAPTERS = 2;
const SITE_TIMEOUT_MS = 6 * 60 * 1000;

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const root = process.platform === "win32"
    ? join(process.env.LOCALAPPDATA || "", "ms-playwright")
    : join(homedir(), process.platform === "darwin" ? "Library/Caches/ms-playwright" : ".cache/ms-playwright");
  const builds = existsSync(root) ? readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse() : [];
  for (const build of builds) {
    for (const exe of ["chrome-win64/chrome.exe", "chrome-win/chrome.exe", "chrome-linux/chrome", "chrome-mac/Chromium.app/Contents/MacOS/Chromium"]) {
      if (existsSync(join(root, build, exe))) return join(root, build, exe);
    }
  }
  return undefined;
}

// Sites whose registry samples are placeholders: pick a real novel from a listing page.
const DISCOVER = {
  wuxiaworld: { listing: "https://www.wuxiaworld.com/novels", link: 'a[href^="/novel/"]', pattern: /^\/novel\/[^/]+\/?$/ },
  "dreamy-translations": { listing: "https://dreamy-translations.com/series", link: 'a[href*="/novel/"]', pattern: /^\/novel\/[^/]+\/?$/ },
};
// Sites whose index cannot list chapters, so discovery starts from chapter 1.
const NEEDS_FIRST_CHAPTER = new Set(["wattpad"]);

async function discoverToc(context, id) {
  const { listing, link, pattern } = DISCOVER[id];
  const page = await context.newPage();
  try {
    await page.goto(listing, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector(link, { timeout: 30000 });
    const hrefs = await page.$$eval(link, (as) => as.map((a) => a.href));
    return hrefs.find((href) => pattern.test(new URL(href).pathname));
  } finally {
    await page.close();
  }
}

async function runSite(context, extensionId, config) {
  const started = Date.now();
  const result = { id: config.id, toc: null, status: "fail", detail: "", chapters: [], issues: [], seconds: 0 };
  const dashboard = await context.newPage();
  const pageErrors = [];
  dashboard.on("pageerror", (err) => pageErrors.push(err.message));
  try {
    // Up-check first, so an outage is reported as the site's fault instead
    // of being mistaken for an extension bug.
    const origin = new URL(DISCOVER[config.id]?.listing || config.sampleUrls.toc).origin;
    const home = await probe(origin);
    if (DISCOVER[config.id] && !home.error && home.status < 500) {
      result.toc = await discoverToc(context, config.id);
      if (!result.toc) throw new Error("No sample novel URL could be found on the listing page");
    } else {
      result.toc = config.sampleUrls?.toc;
    }
    const reach = classifyProbe(home, await probe(result.toc));
    if (reach.verdict !== "up") {
      result.status = reach.verdict;
      result.detail = reach.reason;
      return result;
    }
    await dashboard.goto(`chrome-extension://${extensionId}/ui/main.html`);
    await dashboard.evaluate(() => {
      const create = URL.createObjectURL;
      URL.createObjectURL = (blob) => { window.__epub = blob; return create(blob); };
    });
    await dashboard.fill("#tocUrl", result.toc);
    if (NEEDS_FIRST_CHAPTER.has(config.id)) await dashboard.fill("#firstChapterUrl", config.sampleUrls.firstChapter);
    await dashboard.setChecked("#autoCompile", false);

    // Stops the run when a verification check appears or link-walking has
    // found enough chapters. Returns once the dashboard is idle again.
    const watch = async (phase) => {
      const deadline = started + SITE_TIMEOUT_MS;
      while (Date.now() < deadline) {
        const state = await dashboard.evaluate(() => ({
          idle: !document.getElementById("loadBtn").disabled,
          log: document.getElementById("log").textContent,
        }));
        // Automatic checks get their quiet wait; only a check needing a person counts.
        if (/Complete it in the tab/.test(state.log) && !result.blocked) {
          result.blocked = true;
          await dashboard.click("#stopBtn").catch(() => {});
        }
        if (phase === "load" && /Discovering chapter 3:/.test(state.log) && !result.walkStopped) {
          result.walkStopped = true;
          await dashboard.click("#stopBtn").catch(() => {});
        }
        if (state.idle) return state.log;
        await dashboard.waitForTimeout(1000);
      }
      await dashboard.click("#stopBtn").catch(() => {});
      throw new Error(`Timed out during ${phase}`);
    };

    await dashboard.click("#loadBtn");
    let log = await watch("load");
    if (result.blocked) {
      result.status = "blocked";
      result.detail = "Verification check (CAPTCHA/Cloudflare) needs a person";
      return result;
    }
    if (await dashboard.isHidden("#chapterSection")) {
      result.detail = (await dashboard.textContent("#resultCounts").catch(() => "")) || "Load failed";
      result.log = log.split("\n").slice(-12).join("\n");
      return result;
    }
    result.found = await dashboard.$$eval("#chapterList input[type=checkbox]", (boxes) => boxes.length);

    await dashboard.click("#selectNoneBtn");
    const boxes = await dashboard.$$("#chapterList input[type=checkbox]");
    for (const box of boxes.slice(0, CHAPTERS)) await box.click();
    await dashboard.click("#compileBtn");
    log = await watch("compile");
    if (result.blocked) {
      result.status = "blocked";
      result.detail = "Verification check (CAPTCHA/Cloudflare) needs a person";
      return result;
    }

    Object.assign(result, await dashboard.evaluate(() => ({
      outcome: document.getElementById("compileResult").dataset.outcome,
      title: document.getElementById("resultTitle").textContent,
      counts: document.getElementById("resultCounts").textContent,
      issues: [...document.querySelectorAll("#resultIssues li")].map((li) => li.textContent.split("\n")[0]),
    })));
    const hasEpub = await dashboard.evaluate(() => !!window.__epub);
    if (hasEpub) {
      Object.assign(result, await dashboard.evaluate(async () => {
        const zip = await JSZip.loadAsync(window.__epub);
        const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
        const chapters = [];
        for (const name of names.filter((n) => /chapter\d+\.xhtml$/.test(n)).sort()) {
          const xhtml = await zip.file(name).async("string");
          const heading = xhtml.match(/<h1>([\s\S]*?)<\/h1>/)?.[1] || "";
          const text = xhtml.replace(/^[\s\S]*?<\/h1>/, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
          // Words that usually mean navigation, comments, or ads leaked into the body.
          const junk = (text.match(/\b(next chapter|previous chapter|comments?|advertisement|log ?in to|subscribe|table of contents)\b/gi) || []).slice(0, 5);
          chapters.push({ heading, words: text.split(" ").length, start: text.slice(0, 90), junk });
        }
        const opf = await zip.file("OEBPS/content.opf").async("string");
        return {
          chapters,
          bookTitle: opf.match(/<dc:title>([\s\S]*?)<\/dc:title>/)?.[1],
          author: opf.match(/<dc:creator>([\s\S]*?)<\/dc:creator>/)?.[1],
          cover: names.some((n) => /images\/cover\./.test(n)),
          images: names.filter((n) => /images\/img/.test(n)).length,
        };
      }));
    }
    // Every chapter locked behind an account: the site works, but a signed-out
    // profile cannot verify the extension against it.
    const locked = result.issues.filter((issue) => /chapter is locked\. Log in/.test(issue));
    const [, compiled, selected] = (result.counts || "").match(/^(\d+) of (\d+) selected/) || [];
    if (locked.length && Number(compiled) === 0 && locked.length === Number(selected)) {
      result.status = "login";
      result.detail = "Site requires an account to read; sign in and rerun with HEADED=1 to verify";
      return result;
    }
    // Stopping link-walking after enough chapters is this harness's own doing.
    if (result.walkStopped) result.issues = result.issues.filter((issue) => !/Chapter discovery was stopped/.test(issue));
    const clean = result.outcome === "success" || (result.outcome === "warning" && !result.issues.length);
    const thin = result.chapters.filter((c) => c.words < 150);
    result.status = clean && result.chapters.length === CHAPTERS && !thin.length ? "pass"
      : result.outcome !== "failed" && result.chapters.length ? "warn" : "fail";
    result.detail = [result.counts, thin.length ? `${thin.length} chapter(s) under 150 words` : "",
      /Security check passed/.test(log) ? "(passed Cloudflare's automatic check)" : ""].filter(Boolean).join(" ");
    if (result.status !== "pass") result.log = log.split("\n").slice(-15).join("\n");
    return result;
  } catch (err) {
    result.detail = err.message.split("\n")[0];
    return result;
  } finally {
    if (pageErrors.length) result.pageErrors = pageErrors;
    result.seconds = Math.round((Date.now() - started) / 1000);
    await dashboard.close().catch(() => {});
  }
}

const only = process.argv.slice(2);
const sites = SITE_CONFIGS.filter((c) => !only.length || only.includes(c.id));
const profile = await mkdtemp(join(tmpdir(), "wn2epub-live-"));
const downloads = await mkdtemp(join(tmpdir(), "wn2epub-live-dl-"));
const context = await chromium.launchPersistentContext(profile, {
  executablePath: findChromium(),
  headless: process.env.HEADED !== "1",
  acceptDownloads: true,
  downloadsPath: downloads,
  args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
});
const results = [];
try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  const extensionId = new URL(worker.url()).host;
  for (const config of sites) {
    const result = await runSite(context, extensionId, config);
    results.push(result);
    console.log(`${result.status.toUpperCase().padEnd(7)} ${config.id.padEnd(20)} ${String(result.seconds).padStart(4)}s  ${result.detail}`);
  }
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true }).catch(() => {});
  await rm(downloads, { recursive: true, force: true }).catch(() => {});
  await writeFile(join(here, "live-results.json"), JSON.stringify(results, null, 2));
}

const tally = (status) => results.filter((r) => r.status === status).map((r) => r.id);
const ours = results.filter((r) => OUR_FAULT.has(r.status)).map((r) => r.id);
console.log(`\n${tally("pass").length} pass, ${tally("down").length} down (site's fault), ${tally("blocked").length} blocked (needs a person; rerun with HEADED=1), ${tally("login").length} need an account, ${ours.length} ours to fix.`);
if (tally("down").length) console.log(`Down: ${tally("down").join(", ")}`);
if (ours.length) console.log(`Ours to fix: ${ours.join(", ")}`);
// Only our own failures fail the run, so a scheduled run flags real regressions.
process.exitCode = ours.length ? 1 : 0;
