// Run with: node tests/compile-feedback.mjs
// Exercise the actual compile controller with browser/network boundaries stubbed.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { queueSnapshot, restoreQueue } from "../core/QueueState.js";
import { SiteRateLimiter, parseRetryAfter } from "../core/RateLimiter.js";
import { decodeHtml } from "../core/Charset.js";
import { getConfigForUrl as realConfigForUrl } from "../core/ParserRegistry.js";

const source = readFileSync(new URL("../ui/main.js", import.meta.url), "utf8")
  .replace(/^import .*;\r?\n/gm, "");

async function run(options = {}) {
  const elements = new Map();
  const listeners = new Set();
  const chapters = [49, 50, 51].map((index) => ({ index, chapterId: index, label: `Title ${index}`, chapterSlug: `chapter-${index}` }));
  function element() {
    return {
      value: "", textContent: "", disabled: false, hidden: true, dataset: {}, children: [],
      setAttribute() {}, removeAttribute() {}, addEventListener() {}, replaceChildren() { this.children = []; },
      appendChild(child) { this.children.push(child); },
      querySelectorAll() { return (options.empty ? [] : chapters).map((c) => ({ dataset: { index: c.index }, checked: true })); },
    };
  }
  let compiler;
  let downloads = 0;
  let filename;
  const context = vm.createContext({
    console, URL, URLSearchParams, crypto: webcrypto, SiteRateLimiter, parseRetryAfter, decodeHtml, getConfigForUrl: (url) => ({ id: "generic", siteName: new URL(url).hostname, toc: {}, content: {}, fetchIntervalBase: 0 }), fetch: options.fetch, AbortSignal, queueSnapshot, restoreQueue, history: { replaceState() {} }, location: { search: "", href: "https://extension.example/ui/main.html" },
    document: {
      getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
      createElement: element,
    },
    browser: {
      runtime: { getManifest: () => ({ version: "test" }) },
      storage: { local: { get: async () => ({}), set: async () => {} } },
      downloads: {
        onChanged: { addListener: (fn) => listeners.add(fn), removeListener: (fn) => listeners.delete(fn) },
        download: async (args) => { filename = args.filename; downloads++; if (options.downloadReject) throw new Error("disk unavailable"); return 7; },
        search: async () => {
          if (options.downloadEvent) {
            setImmediate(() => listeners.forEach((fn) => fn({ id: 7, state: { current: options.downloadEvent }, error: { current: "FILE_FAILED" } })));
            return [{ id: 7, state: "in_progress" }];
          }
          return [{ id: 7, state: "complete" }];
        },
      },
    },
    WuxiaworldApi: { getChapter: async (id) => {
      if (options.stopChapter === id) vm.runInContext("cancelRequested = true", context);
      if (options.badChapter === id || options.allChaptersFail) throw new Error("HTTP 403");
      return String(id);
    } },
    DOMParser: class { parseFromString(html) { return { querySelector: () => ({ html }) }; } },
    sanitizeChapterContent(body, doc, config, base, register, reportImageError) {
      const id = Number(body.html.match(/>(\d+)</)[1]);
      if (options.missingImageSource === id) reportImageError("The page contains an image without a source URL.");
      const url = options.sharedImage ? "https://example.com/shared.png" : `https://example.com/${id}.png`;
      const fragment = `<p>Text</p><img src="../images/${register(url)}"/>`;
      if (options.badSanitizer === id) throw new Error("Invalid image URL");
      return fragment;
    },
    EpubCompiler: class {
      constructor(metadata) { compiler = this; this.metadata = metadata; this.chapters = []; this.images = []; }
      setCover() {}
      addChapter(title, xhtmlFragment) { this.chapters.push({ title, xhtmlFragment }); }
      addImage(filename) { this.images.push(filename); }
      async generate() { if (options.generateFail) throw new Error("ZIP failed"); return new Blob(["epub"]); }
    },
    fetchImageStub: async (url) => {
      if (url === options.badImage || (options.badCover && url.endsWith("cover.png"))) throw new Error("HTTP 404");
      if (options.stopImage) vm.runInContext("cancelRequested = true", context);
      return { blob: new Blob(["image"]), ext: "png" };
    },
  });
  vm.runInContext(source, context);
  await vm.runInContext("queueInitialization", context);
  context.testState = {
    config: {}, novelTitle: "Test Book", author: "Author", chapters,
    outputTitle: options.outputTitle,
    coverUrl: options.badCover ? "https://example.com/cover.png" : null,
    discoveryIssues: options.discoveryIssues || [],
  };
  vm.runInContext(`state = testState; ${options.realFetchImage ? "" : "fetchImage = fetchImageStub;"} sleep = async () => {};`, context);
  await vm.runInContext("runCompile()", context);
  assert.equal(listeners.size, 0, "download listener must be removed");
  assert.equal(elements.get("loadBtn").disabled, false);
  return {
    outcome: elements.get("compileResult").dataset.outcome,
    title: elements.get("resultTitle").textContent,
    counts: elements.get("resultCounts").textContent,
    issues: elements.get("resultIssues").children.map((li) => li.textContent).join("\n"),
    compiler, downloads, filename, context,
    selection: elements.get("selectionCount").textContent,
    compileLabel: elements.get("compileBtn").textContent,
  };
}

const clean = await run();
const renamed = await run({ outputTitle: "My Novel: Volume 1" });
assert.equal(renamed.compiler.metadata.title, "My Novel: Volume 1");
assert.equal(renamed.filename, "My Novel_ Volume 1.epub");
assert.equal(clean.outcome, "success");
assert.match(clean.counts, /3 of 3 selected chapters included. 3 of 3 chapter images included/);
assert.equal(clean.issues, "");

const missing = await run({ badImage: "https://example.com/50.png" });
assert.equal(missing.outcome, "warning");
assert.match(missing.issues, /Image omitted from Chapter 50: Title 50: HTTP 404/);
assert.match(missing.issues, /https:\/\/example.com\/50.png/);
assert.match(missing.counts, /2 of 3 chapter images/);
assert.doesNotMatch(missing.compiler.chapters[1].xhtmlFragment, /<img/);

const shared = await run({ sharedImage: true, badImage: "https://example.com/shared.png" });
assert.match(shared.issues, /Chapter 49: Title 49; Chapter 50: Title 50; Chapter 51: Title 51/);
assert.match(shared.counts, /0 of 1 chapter images/);

const skipped = await run({ badChapter: 50 });
assert.equal(skipped.outcome, "warning");
assert.match(skipped.title, /Incomplete/);
assert.match(skipped.issues, /Chapter 50: Title 50 omitted: HTTP 403/);
assert.match(skipped.counts, /2 of 3 selected chapters/);

assert.match((await run({ badCover: true })).issues, /Cover image omitted: HTTP 404/);
const stopped = await run({ stopChapter: 49 });
assert.match(stopped.title, /Incomplete/);
assert.match(stopped.issues, /Stopped before 2 selected chapter/);
assert.match(stopped.issues, /Image omitted from Chapter 49/);
assert.match((await run({ stopImage: true })).issues, /stopped before download/);
assert.equal((await run({ discoveryIssues: ["Discovery stopped early"] })).outcome, "warning");

const empty = await run({ empty: true });
assert.equal(empty.outcome, "failed");
assert.equal(empty.downloads, 0);
const allFailed = await run({ allChaptersFail: true });
assert.equal(allFailed.outcome, "failed");
assert.equal(allFailed.downloads, 0);
assert.match(allFailed.counts, /0 of 3 selected chapters/);
const badContent = await run({ badSanitizer: 50 });
assert.match(badContent.counts, /2 of 2 chapter images/);
assert.match(badContent.issues, /Chapter 50: Title 50 omitted: Invalid image URL/);
assert.equal((await run({ generateFail: true })).outcome, "failed");
assert.match((await run({ downloadReject: true })).issues, /disk unavailable/);
assert.equal((await run({ downloadEvent: "complete" })).outcome, "success");
const interrupted = await run({ downloadEvent: "interrupted" });
assert.equal(interrupted.outcome, "failed");
assert.match(interrupted.issues, /Download interrupted: FILE_FAILED/);
const missingSource = await run({ missingImageSource: 50 });
assert.equal(missingSource.outcome, "warning");
assert.match(missingSource.issues, /Image omitted from Chapter 50: Title 50:.*without a source/);

// Hotlink protection answering 200 with HTML must be reported, not packaged as a .jpg.
const htmlResponse = async () => ({ ok: true, status: 200, headers: { get: () => "text/html; charset=utf-8" }, blob: async () => new Blob(["<html>"]) });
const hotlinked = await run({ realFetchImage: true, fetch: htmlResponse });
assert.equal(hotlinked.outcome, "warning");
assert.match(hotlinked.issues, /Not an image \(text\/html\)/);
assert.match(hotlinked.counts, /0 of 3 chapter images/);

assert.equal(clean.selection, "3 of 3 selected");
assert.equal(clean.compileLabel, "Compile EPUB (3 chapters)");

const name = (title) => vm.runInContext(`sanitizeFilename(${JSON.stringify(title)})`, clean.context);
assert.equal(name("Book: One?"), "Book_ One_");
assert.equal(name("  ..Trailing dots... "), "Trailing dots");
assert.equal(name("Tab\tand\nnewline"), "Tab and newline");
assert.equal(name("CON"), "CON_");
assert.equal(name("..."), "book");
assert.equal(name("x".repeat(300)).length, 150);

// A tab that finished loading before the listener attached must not wait out the timeout.
Object.assign(clean.context, { setTimeout, clearTimeout });
clean.context.browser.tabs = {
  onUpdated: { addListener() {}, removeListener() {} },
  get: async () => ({ status: "complete", url: "https://example.com/novel" }),
};
await vm.runInContext("waitForTabLoad(1, 50)", clean.context);

// Hosts that label JPEGs as fonts must still be packaged, by their bytes.
const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
const disguised = await run({ realFetchImage: true, fetch: async () => ({ ok: true, status: 200, headers: { get: () => "font/woff" }, blob: async () => new Blob([jpegBytes]) }) });
assert.equal(disguised.outcome, "success");
assert.match(disguised.counts, /3 of 3 chapter images/);

const ctx = clean.context;
const htmlPage = (text) => ({ ok: true, status: 200, headers: { get: () => "text/html" }, arrayBuffer: async () => new TextEncoder().encode(text).buffer });
// Transient server errors are retried; other 4xx answers are not.
let calls = 0;
ctx.fetch = async () => (++calls > 2 ? htmlPage("page") : { ok: false, status: 503 });
vm.runInContext("pageCache.clear(); sleep = async () => {};", ctx);
assert.equal(await vm.runInContext("fetchFast('https://example.com/flaky')", ctx), "page");
assert.equal(calls, 3);
calls = 0;
ctx.fetch = async () => { calls++; return { ok: false, status: 403 }; };
await assert.rejects(vm.runInContext("fetchFast('https://example.com/blocked')", ctx), /HTTP 403/);
assert.equal(calls, 1, "a 403 must fall through to tab fetching without retries");

// An automatic security check that clears by itself never involves the user.
const activated = [];
ctx.browser.tabs = { update: async (id) => { activated.push(id); }, getCurrent: async () => ({ id: 99 }) };
let reads = 0;
ctx.readTabStub = async () => (++reads < 3 ? { challenge: true, html: "" } : { challenge: false, html: "solved" });
assert.equal((await vm.runInContext("waitForUserVerification(5, readTabStub)", ctx)).html, "solved");
assert.deepEqual(activated, [], "an automatic check must not pull the user in");

// A check that outlasts the quiet wait is shown to the user, then reading resumes.
reads = 0;
const solved = await vm.runInContext("waitForUserVerification(5, readTabStub, 0)", ctx);
assert.equal(solved.html, "solved");
assert.deepEqual(activated, [5, 99], "show the challenge tab, then return to the dashboard");

// Rate limits: a 429 pauses (honoring Retry-After), slows the site's pace,
// remembers it, and retries the same request without failing it.
const logText = () => vm.runInContext("logLines.join('\\n')", ctx);
calls = 0;
ctx.fetch = async () => (++calls === 1
  ? { ok: false, status: 429, headers: { get: (h) => (h === "retry-after" ? "45" : null) } }
  : htmlPage("after pause"));
vm.runInContext("limiters.clear(); pageCache.clear(); clearLog(); cancelRequested = false;", ctx);
assert.equal(await vm.runInContext("fetchFast('https://slow.example/chapter-1')", ctx), "after pause");
assert.equal(calls, 2);
assert.match(logText(), /slow\.example asked us to slow down\. Pausing 45s/);
assert.equal(vm.runInContext("limiterFor(getConfigForUrl('https://slow.example/x')).delay", ctx), 1000, "delay doubles from the 500ms floor");
assert.equal(vm.runInContext("learnedRates['slow.example'].delay", ctx), 1000, "learned pace is persisted");

// A 503 on first contact is an outage, not a rate limit: fail fast, no pause.
calls = 0;
ctx.fetch = async () => { calls++; return { ok: false, status: 503 }; };
vm.runInContext("clearLog();", ctx);
await assert.rejects(vm.runInContext("fetchFast('https://down.example/novel')", ctx), /HTTP 503/);
assert.equal(calls, 3);
assert.doesNotMatch(logText(), /slow down/);

// A site demanding more than 10 minutes is left alone rather than retried.
calls = 0;
ctx.fetch = async () => { calls++; return { ok: false, status: 429, headers: { get: () => "3600" } }; };
await assert.rejects(vm.runInContext("fetchFast('https://strict.example/novel')", ctx), /HTTP 429/);
assert.equal(calls, 1);
assert.match(logText(), /more than 10 minutes/);

// Unsupported sites: non-English next labels and icon-only buttons.
const link = (text, href, extra = {}) => ({ textContent: text, getAttribute: (name) => (name === "href" ? href : null), ...extra });
const fakeDoc = (links, fallback = []) => ({ querySelectorAll: (selector) => (selector === "a" ? links : fallback) });
ctx.genericConfig = { content: { nextLinkSelector: "a", nextLinkTextMatch: /^\s*(next\b|다음\s*화|다음|下一[章页頁话話]|次の?[話章へ]|siguiente|suivant|próximo|weiter)/i, nextLinkFallbackSelector: "x" } };
const next = (doc) => { ctx.testDoc = doc; return vm.runInContext("findNextChapterLink(testDoc, '', 'https://example.com/c/1', genericConfig, 'https://example.com/novel')", ctx); };
assert.equal(next(fakeDoc([link("이전화", "/c/0"), link("다음화", "/c/2")])), "https://example.com/c/2");
assert.equal(next(fakeDoc([link("下一章", "/c/2")])), "https://example.com/c/2");
assert.equal(next(fakeDoc([link("", "/c/0")], [link("", "/c/2")])), "https://example.com/c/2");
assert.equal(next(fakeDoc([], [link("", "javascript:void(0)")])), null);
assert.equal(next(fakeDoc([], [link("", "/novel")])), null, "a link back to the index ends the walk");

// Paginated chapter lists: every page is read, repeated links are dropped,
// and a failing page keeps the chapters already found.
const tocLink = (href, text = "") => link(text, href);
const tocPages = {
  p1: { links: [tocLink("/c/1"), tocLink("/c/2")], next: [tocLink("/novel?page=1", "1"), tocLink("/novel?page=2#chapters", "Next")] },
  p2: { links: [tocLink("/c/2"), tocLink("/c/3")], next: [tocLink("/novel?page=3", "Next")] },
};
ctx.DOMParser = class { parseFromString(html) { const page = tocPages[html]; const pick = (s) => (s === "LINKS" ? page.links : page.next); return { querySelectorAll: pick, querySelector: (s) => pick(s)[0] || null }; } };
ctx.fetch = async (url) => (url.endsWith("page=2") ? htmlPage("p2") : { ok: false, status: 404 });
ctx.pagedConfig = { id: "paged", siteName: "Paged", fetchIntervalBase: 0, toc: { linksSelector: "LINKS", nextPageSelector: "NEXT", nextPageTextMatch: /^\s*Next\s*$/ } };
vm.runInContext("pageCache.clear(); clearLog();", ctx);
ctx.firstTocDoc = new ctx.DOMParser().parseFromString("p1");
const paged = await vm.runInContext("collectTocLinks(firstTocDoc, 'https://example.com/novel', pagedConfig)", ctx);
assert.deepEqual(Array.from(paged, ({ a, pageUrl }) => new URL(a.getAttribute("href"), pageUrl).href), ["https://example.com/c/1", "https://example.com/c/2", "https://example.com/c/3"]);
assert.match(logText(), /Reading chapter list page 2: https:\/\/example\.com\/novel\?page=2$/m);
assert.match(logText(), /stopped reading the chapter list at https:\/\/example\.com\/novel\?page=3 \(HTTP 404\)/);

// Newest-first lists are ordered by the number in the link's URL or text.
const entry = (text, href) => ({ ...link(text, href), dataset: {} });
const indexOf = (a, toc) => { ctx.testA = a; ctx.testToc = { toc }; return vm.runInContext("tocChapterIndex(testA, 4, testToc)", ctx); };
assert.equal(indexOf(entry("C12 : Title", "/chapter/9981"), { chapterIndexFromTextRegex: /^C(\d+)\b/ }), 12);
assert.equal(indexOf(entry("#7", "/novels/x/7-gg/"), { chapterIndexFromHrefRegex: /\/(\d+)-[^/]*\/?$/ }), 7);
assert.equal(indexOf(entry("Announcement", "/chapter/1"), { chapterIndexFromTextRegex: /^C(\d+)\b/ }), 5, "unnumbered entries keep list order");

// An index showing only the newest chapters is filled in from numbered paths.
ctx.listed = [{ index: 4, href: "https://ex.com/novel/chapter/4", label: "Latest" }, { index: 2, href: "https://ex.com/novel/chapter/2", label: "Two" }];
vm.runInContext("fillNumberedChapters(listed, 'https://ex.com/novel/', '/chapter/')", ctx);
assert.deepEqual(ctx.listed.map((c) => [c.index, c.href]).sort((a, b) => a[0] - b[0]),
  [[1, "https://ex.com/novel/chapter/1"], [2, "https://ex.com/novel/chapter/2"], [3, "https://ex.com/novel/chapter/3"], [4, "https://ex.com/novel/chapter/4"]]);

// Translator's notes outside the body are found by selector and heading text.
const box = (text) => ({ textContent: text });
ctx.notesConfig = { content: { notesSelector: "NOTES", notesTextMatch: /^\s*Translator'?s Notes/i } };
ctx.notesDoc = { querySelectorAll: () => [box("Announcement"), box("Translator's Notes 1 Slang for...")] };
assert.equal(vm.runInContext("findChapterNotes(notesDoc, notesConfig)", ctx).textContent, "Translator's Notes 1 Slang for...");
ctx.notesDoc = { querySelectorAll: () => [box("Announcement")] };
assert.equal(vm.runInContext("findChapterNotes(notesDoc, notesConfig)", ctx), null);

// A chapter split over pages follows "next page", not "next chapter".
ctx.pageConfig = { content: { pageLinkTextMatch: /^下一頁$/ } };
ctx.pageDoc = fakeDoc([link("看下一章", "/chapter/1/56021.html"), link("下一頁", "/chapter/1/56020_2.html")]);
assert.equal(vm.runInContext("findChapterPageLink(pageDoc, 'https://uu.example/chapter/1/56020.html', pageConfig)", ctx), "https://uu.example/chapter/1/56020_2.html");
ctx.pageDoc = fakeDoc([link("下一章", "/chapter/1/56021.html")]);
assert.equal(vm.runInContext("findChapterPageLink(pageDoc, 'https://uu.example/chapter/1/56020_2.html', pageConfig)", ctx), null);

// Unlisted sites: the novel's page is enough. A start link is found in many
// languages, and a pasted chapter page is used as the first chapter.
const generic = realConfigForUrl("https://unlisted.example/novel/abc");
for (const label of ["Start Reading", "Read First Chapter", "Chapter 1", "開始閱讀", "第1章", "Đọc từ đầu", "Начать чтение", "1화"]) {
  assert.match(label, generic.toc.startLinkTextMatch, label);
}
for (const label of ["Chapter 10", "Chapter 12: Rain", "Latest chapter"]) assert.doesNotMatch(label, generic.toc.startLinkTextMatch, label);
for (const label of ["Chương sau", "Дальше →", "Selanjutnya"]) assert.match(label, generic.content.nextLinkTextMatch, label);
assert.ok(generic.fetchIntervalBase >= 2000, "unlisted sites start at a slow, polite pace");
ctx.genericStartConfig = generic;
const startPage = (links) => {
  ctx.DOMParser = class { parseFromString() { return { querySelectorAll: (s) => (s === "a" || s === "a[href]" ? links : []) }; } };
  vm.runInContext("fetchPage = async () => 'page';", ctx);
};
startPage([link("Chapter 12", "/n/c12"), link("Start Reading", "/n/c1"), link("Chapter 1", "https://elsewhere.example/c1")]);
assert.equal(await vm.runInContext("findGenericStart('https://unlisted.example/n', genericStartConfig)", ctx), "https://unlisted.example/n/c1");
startPage([link("Next", "/n/c3")]);
assert.equal(await vm.runInContext("findGenericStart('https://unlisted.example/n/c2', genericStartConfig)", ctx), "https://unlisted.example/n/c2", "a chapter page starts at itself");
startPage([link("Home", "/")]);
await assert.rejects(vm.runInContext("findGenericStart('https://unlisted.example/n', genericStartConfig)", ctx), /Could not find where this novel starts/);

console.log("Compile feedback checks passed (43 scenarios).");
