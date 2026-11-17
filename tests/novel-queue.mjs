// Run with: node tests/novel-queue.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { queueSnapshot, restoreQueue } from "../core/QueueState.js";
import { SiteRateLimiter, parseRetryAfter } from "../core/RateLimiter.js";
import { decodeHtml } from "../core/Charset.js";
import { parseQueueInput, validateNovelUrl } from "../core/QueueInput.js";
import { getConfigForUrl } from "../core/ParserRegistry.js";
import { validateGalleryUrl, canonicalDreamyNovelUrl, gallerySkipReason } from "../core/Gallery.js";

const source = readFileSync(new URL("../ui/main.js", import.meta.url), "utf8").replace(/^import .*;\r?\n/gm, "");
const url = (id) => `https://example.com/novel/${id}`;

async function setup({ fail = [], warn = [], onLoad, onCompile, storage = {}, saveFails = false } = {}) {
  const elements = new Map();
  function element() {
    return {
      value: "", textContent: "", disabled: false, hidden: false, checked: false, dataset: {}, children: [], events: {},
      setAttribute(name, value) { this[name] = value; }, removeAttribute(name) { delete this[name]; },
      addEventListener(type, fn) { this.events[type] = fn; },
      append(...nodes) { this.children.push(...nodes); }, appendChild(node) { this.children.push(node); },
      replaceChildren() { this.children = []; }, querySelectorAll() { return []; },
    };
  }
  const loaded = [], compiled = [];
  let active = 0, maxActive = 0;
  const context = vm.createContext({
    console, URL, URLSearchParams, crypto: webcrypto, SiteRateLimiter, parseRetryAfter, decodeHtml, queueSnapshot, restoreQueue, validateGalleryUrl, canonicalDreamyNovelUrl, gallerySkipReason, history: { replaceState() {} }, location: { search: "", href: "https://extension.example/ui/main.html" }, parseQueueInput, validateNovelUrl,
    document: { getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); }, createElement: element },
    browser: { runtime: { getManifest: () => ({ version: "test" }) }, storage: { local: { get: async (key) => ({ [key]: structuredClone(storage[key]) }), set: async (values) => {
      if (saveFails) throw new Error("Storage quota exceeded");
      Object.assign(storage, structuredClone(values));
    } } } },
    getConfigForUrl: (value) => ({ id: value.includes("unsupported") ? "generic" : "test", toc: {} }),
    async loadTocStub(value) {
      const id = new URL(value).pathname.split("/").pop();
      assert.equal(vm.runInContext("state.chapters.length", context), 0, "old novel state must be cleared before loading");
      assert.equal(vm.runInContext("pageCache.size + imageCache.size", context), 0, "jobs must not retain earlier book caches");
      loaded.push(id);
      active++;
      maxActive = Math.max(maxActive, active);
      try {
        if (onLoad) await onLoad(id, context);
        if (fail.includes(id)) throw new Error(`Network failed for ${id}`);
        context.nextState = { config: {}, novelTitle: `Book ${id}`, author: "Author", coverUrl: null, chapters: [{ index: 1, label: "One" }] };
        vm.runInContext("state = nextState; pageCache.set('page', 'html'); imageCache.set('image', 'blob');", context);
      } finally { active--; }
    },
    async compileStub(report) {
      const title = vm.runInContext("state.novelTitle", context);
      const id = title.slice(5);
      compiled.push(id);
      active++;
      maxActive = Math.max(maxActive, active);
      try {
        if (onCompile) await onCompile(id, context);
        Object.assign(report, { selected: 1, compiled: 1, images: 1, savedImages: 1, downloaded: true, filename: `${title}.epub` });
        report.stopped = vm.runInContext("cancelRequested", context);
        if (warn.includes(id)) report.issues.push("Image omitted from Chapter 50: HTTP 404");
      } finally { active--; }
    },
  });
  vm.runInContext(source, context);
  await vm.runInContext("queueInitialization", context);
  vm.runInContext("loadToc = loadTocStub; compile = compileStub;", context);
  return {
    context, elements, loaded, compiled, storage,
    get jobs() { return vm.runInContext("novelQueue", context); },
    get maxActive() { return maxActive; },
    add(text) { elements.get("queueUrls").value = text; elements.get("addQueueBtn").events.click(); },
    start() { return elements.get("startQueueBtn").events.click(); },
    stop() { elements.get("stopQueueBtn").events.click(); },
  };
}

assert.equal(validateNovelUrl("https://example.com/book#toc"), "https://example.com/book");
for (const bad of ["no URL", "javascript:alert(1)", "file:///secret", "https://user:secret@example.com/"]) {
  assert.throws(() => validateNovelUrl(bad));
}
const parsed = parseQueueInput(`\n${url(1)}\r\n${url(2)} | ${url(2)}/chapter-1\ninvalid\n${url(3)} | one | two`);
assert.equal(parsed.length, 4);
assert.equal(parsed[1].firstChapterUrl, `${url(2)}/chapter-1`);
assert.match(parsed[2].error, /Line 4/);
assert.match(parsed[3].error, /only one/);
assert.doesNotMatch(parseQueueInput("https://user:secret@example.com/")[0].error, /secret/);

const batch = await setup({ fail: ["5"], warn: ["9"] });
batch.add(Array.from({ length: 20 }, (_, i) => url(i + 1)).join("\n"));
batch.add(`${url(1)}#toc\nnot-a-url`);
assert.equal(batch.jobs.length, 21, "duplicates should not create another download");
await Promise.all([batch.start(), batch.start()]);
assert.equal(batch.maxActive, 1, "double start must not create concurrent workers");
assert.equal(batch.loaded.length, 20);
assert.equal(batch.compiled.length, 19);
assert.ok(!batch.compiled.includes("5"), "failed load must not compile old state");
assert.equal(batch.jobs[4].status, "failed");
assert.equal(batch.jobs[8].status, "warning");
assert.equal(batch.jobs[19].status, "success");
assert.match(batch.jobs[8].ui.issues.children[0].textContent, /Chapter 50/);
assert.match(batch.elements.get("queueSummary").textContent, /18 succeeded, 1 with warnings, 2 failed/);
assert.equal(batch.elements.get("loadBtn").disabled, false);
assert.equal(vm.runInContext("pageCache.size + imageCache.size", batch.context), 0);

batch.jobs[8].ui.retry.events.click();
assert.equal(batch.jobs[8].status, "waiting");
await batch.start();
assert.equal(batch.compiled.length, 20, "retry must process only the requested novel");

let release;
const gate = new Promise((resolve) => { release = resolve; });
const dynamic = await setup({ onLoad: async (id) => { if (id === "1") await gate; } });
dynamic.add(url(1));
const running = dynamic.start();
assert.equal(dynamic.elements.get("loadBtn").disabled, true);
assert.equal(dynamic.elements.get("useTabFetch").disabled, true);
dynamic.add(url(2));
release();
await running;
assert.deepEqual(dynamic.compiled, ["1", "2"], "entries added during a run should also be processed");

const stopped = await setup({ onLoad: async (id, context) => { if (id === "1") vm.runInContext("requestStop()", context); } });
stopped.add(`${url(1)}\n${url(2)}`);
await stopped.start();
assert.equal(stopped.jobs[0].status, "stopped");
assert.equal(stopped.jobs[1].status, "waiting");
assert.equal(stopped.compiled.length, 0, "stop during discovery must not reset cancellation and compile");
assert.match(stopped.elements.get("queueSummary").textContent, /Queue paused/);
await stopped.start();
assert.deepEqual(stopped.compiled, ["2"]);

const partial = await setup({ onCompile: async (id, context) => { if (id === "1") vm.runInContext("requestStop()", context); } });
partial.add(`${url(1)}\n${url(2)}`);
await partial.start();
assert.equal(partial.jobs[0].status, "stopped");
assert.equal(partial.jobs[0].report.downloaded, true);
assert.equal(partial.jobs[1].status, "waiting");

// An unlisted site whose page has no start link fails with guidance, and the queue moves on.
const unsupported = await setup();
unsupported.context.DOMParser = class { parseFromString() { return { querySelectorAll: () => [] }; } };
vm.runInContext(`fetchPage = async () => "<p>no links</p>";
  getConfigForUrl = (value) => ({ id: value.includes("unsupported") ? "generic" : "test", siteName: "unsupported.example",
    toc: { startLinkTextMatch: /^start reading/i }, content: { nextLinkSelector: "a", nextLinkTextMatch: /^next/i } });`, unsupported.context);
unsupported.add(`https://unsupported.example/novel\n${url(1)}`);
await unsupported.start();
assert.match(unsupported.jobs[0].report.issues[0], /Could not find where this novel starts.*First chapter URL/);
assert.deepEqual(unsupported.compiled, ["1"]);

const compileFailure = await setup({ onCompile: async (id) => { if (id === "1") throw new Error("ZIP failed"); } });
compileFailure.add(`${url(1)}\n${url(2)}`);
await compileFailure.start();
assert.equal(compileFailure.jobs[0].status, "failed");
assert.match(compileFailure.jobs[0].report.issues[0], /ZIP failed/);
assert.equal(compileFailure.jobs[1].status, "success");

// A locked HTTP response must not be reused by the browser-tab fallback.
const fallback = await setup();
fallback.context.AbortSignal = AbortSignal;
fallback.context.fetch = async (value, options) => {
  assert.ok(options.signal instanceof AbortSignal, "HTTP requests must have a timeout signal");
  return { ok: true, headers: { get: () => "text/html" }, arrayBuffer: async () => new TextEncoder().encode("chapter").buffer };
};
assert.equal(await vm.runInContext("fetchFast('https://example.com/timeout-test')", fallback.context), "chapter");
vm.runInContext(`
  els.useTabFetch.checked = true;
  fetchFast = async (url) => { pageCache.set(url, 'locked'); return 'locked'; };
  looksLocked = () => true;
  fetchViaTab = async (url) => {
    if (pageCache.has(url)) throw new Error('Locked response was cached');
    return 'rendered chapter';
  };
`, fallback.context);
assert.equal(await vm.runInContext("fetchChapterPage('https://example.com/chapter', {}, {})", fallback.context), "rendered chapter");
console.log("Novel queue checks passed: 20-book run, validation, duplicates, failure isolation, retry, stop/continue, added jobs, cache isolation, and locked-page fallback.");

// Pause must finish the current novel without setting cancellation.
const paused = await setup({ onCompile: async (id, context) => {
  if (id === "1") {
    vm.runInContext("els.pauseQueueBtn.events.click()", context);
    assert.equal(vm.runInContext("cancelRequested", context), false);
    vm.runInContext("updateNovelProgress('Chapter 50 of 120', 49, 120)", context);
    assert.equal(vm.runInContext("els.queueNovelProgress.value", context), 49);
  }
} });
paused.add(`${url(1)}\n${url(2)}`);
await paused.start();
assert.equal(paused.jobs[0].status, "success");
assert.equal(paused.jobs[1].status, "waiting");
assert.equal(paused.elements.get("queueOverallProgress").value, 1);
assert.match(paused.elements.get("queueActiveTitle").textContent, /Novel 1 of 2/);

const reloaded = await setup({ storage: structuredClone(paused.storage) });
assert.equal(reloaded.jobs[0].status, "success");
assert.equal(reloaded.jobs[0].report.filename, "Book 1.epub");
assert.equal(reloaded.jobs[1].status, "paused");
assert.equal(reloaded.loaded.length, 0, "reload must not auto-start");
assert.equal(reloaded.elements.get("batchWorkspace").hidden, false);
reloaded.elements.get("attentionOnly").checked = true;
reloaded.elements.get("attentionOnly").events.change();
assert.equal(reloaded.jobs[0].ui.row.hidden, true);
assert.equal(reloaded.jobs[1].ui.row.hidden, false);
await reloaded.start();
assert.deepEqual(reloaded.compiled, ["2"], "resume must not redownload completed novels");
assert.equal(reloaded.elements.get("queueFilterEmpty").hidden, false);
reloaded.elements.get("singleModeBtn").events.click();
assert.equal(reloaded.elements.get("batchWorkspace").hidden, true);
assert.equal(reloaded.elements.get("singleWorkspace").hidden, false);

const interruptedSnapshot = queueSnapshot([{ tocUrl: url(1), firstChapterUrl: "", status: "compiling", report: null, apiToken: "secret", ui: {} }]);
assert.doesNotMatch(JSON.stringify(interruptedSnapshot), /secret|apiToken|ui/);
assert.equal(restoreQueue(interruptedSnapshot)[0].status, "paused");
assert.throws(() => restoreQueue({ version: 2, jobs: [] }));
const damaged = await setup({ storage: { latestNovelQueue: "novelQueue:bad", "novelQueue:bad": { version: 99 } } });
assert.match(damaged.elements.get("queueSaveStatus").textContent, /Could not restore/);
assert.equal(damaged.storage["novelQueue:bad"].version, 99, "corrupt data must not be overwritten");
const unsaved = await setup({ saveFails: true });
unsaved.add(url(1));
await vm.runInContext("saveChain", unsaved.context);
assert.match(unsaved.elements.get("queueSaveStatus").textContent, /Storage quota exceeded/);
assert.equal(unsaved.jobs.length, 1);
console.log("Queue UX checks passed: pause, progress, saved reports, paused recovery, resume, filters, modes, and storage failure feedback.");

// A WoopRead index must trigger first-chapter walking, not compile its latest-12 preview.
const woopread = await setup();
woopread.context.woopConfig = getConfigForUrl("https://woopread.com/series/prince-rage");
vm.runInContext(`
  getConfigForUrl = () => woopConfig;
  fetchPage = async () => 'index';
  DOMParser = class { parseFromString() { return { querySelectorAll: () => [
    { textContent: 'Chapter 40', getAttribute: () => '/series/prince-rage/chapter-40' },
    { textContent: ' Read Now ', getAttribute: () => '/series/prince-rage/chapter-0-prologue' }
  ] }; } };
  loadViaNextLinkWalk = async (toc, first) => { state.chapters = [{ href: first }]; };
`, woopread.context);
await vm.runInContext("loadNovel('https://woopread.com/series/prince-rage', '')", woopread.context);
assert.equal(vm.runInContext("state.chapters[0].href", woopread.context), "https://woopread.com/series/prince-rage/chapter-0-prologue");
assert.equal(vm.runInContext("findChapterBody({querySelector: () => null}, woopConfig)", woopread.context), null);
vm.runInContext("DOMParser = class { parseFromString() { return {querySelectorAll: () => []}; } };", woopread.context);
await assert.rejects(vm.runInContext("loadNovel('https://woopread.com/series/prince-rage', '')", woopread.context), /Could not find the first chapter/);
console.log("WoopRead controller checks passed: index-only discovery, missing Read Now feedback, and no comment fallback.");

const mint = await setup();
mint.context.mintConfig = getConfigForUrl("https://www.mistminthaven.com/novels/test");
vm.runInContext(`
  getConfigForUrl = () => mintConfig;
  els.useTabFetch.checked = false;
  fetchViaTab = async () => 'rendered';
  fetchFast = async () => { throw new Error('Raw fetch cannot render Mistmint'); };
`, mint.context);
assert.equal(await vm.runInContext("fetchPage('https://www.mistminthaven.com/novels/test')", mint.context), "rendered");
assert.equal(await vm.runInContext("fetchChapterPage('https://www.mistminthaven.com/novels/test/chapter-0', mintConfig, {})", mint.context), "rendered");
await vm.runInContext("loadNovel('', 'https://www.mistminthaven.com/novels/test/chapter-0')", mint.context);
assert.deepEqual(mint.loaded, ["test"], "Chapter URLs must resolve to their index, not a one-chapter walk");
await assert.rejects(vm.runInContext("loadNovel('https://www.mistminthaven.com/', '')", mint.context), /novel URL/);
assert.equal(vm.runInContext("findChapterBody({querySelector: () => null}, mintConfig)", mint.context), null);

const injection = await setup();
injection.context.mintConfig = mint.context.mintConfig;
vm.runInContext(`
  getConfigForUrl = () => mintConfig;
  readMistmintPage = () => {};
  waitForTabLoad = async () => {};
  sleep = async () => {};
  browser.tabs = { create: async () => ({id: 123}), remove: async () => { globalThis.tabClosed = true; } };
  browser.scripting = { executeScript: async () => [{error: {message: 'Premium chapter is locked'}}] };
`, injection.context);
await assert.rejects(vm.runInContext("fetchViaTab('https://www.mistminthaven.com/novels/test/chapter-3')", injection.context), /Premium chapter is locked/);
assert.equal(injection.context.tabClosed, true, "Failed render must close its background tab");
assert.equal(vm.runInContext("pageCache.has('https://www.mistminthaven.com/novels/test/chapter-3')", injection.context), false, "Failed render must not be cached");
console.log("Mistmint controller checks passed: automatic browser rendering, index resolution, strict body, injected errors, and tab cleanup.");

const named = await setup({ onCompile: async (id, context) => {
  assert.equal(vm.runInContext("state.outputTitle", context), id === "1" ? "My Novel" : "Book 2");
  assert.equal(vm.runInContext("activeQueueJob.ui.name.disabled", context), true);
} });
named.add(`${url(1)}\n${url(2)}`);
named.jobs[0].ui.name.value = "  My Novel  ";
named.jobs[0].ui.name.events.input();
assert.equal(named.jobs[0].customTitle, "My Novel");
assert.match(named.jobs[0].ui.title.textContent, /My Novel/);
const restoredNames = restoreQueue(queueSnapshot(named.jobs));
assert.equal(restoredNames[0].customTitle, "My Novel");
assert.equal(restoredNames[1].customTitle, undefined, "Old queues need no custom name");
await named.start();
assert.equal(named.jobs[0].customTitle, "My Novel", "Discovery must not overwrite the custom name");
assert.equal(named.jobs[0].title, "Book 1", "Keep original title for chapter-title cleanup");
assert.throws(() => restoreQueue({ version: 1, jobs: [{ tocUrl: url(1), status: "waiting", customTitle: 4 }] }), /custom name/);
console.log("Batch name checks passed: editing, persistence, detected-title fallback, compilation lock, and output title override.");

const chapterField = await setup({ onLoad: async (id, context) => {
  assert.equal(vm.runInContext("activeQueueJob.ui.firstChapter.disabled", context), true);
} });
chapterField.add(url(1));
const chapterJob = chapterField.jobs[0];
chapterJob.ui.firstChapter.value = "javascript:alert(1)";
chapterJob.ui.firstChapter.events.input();
assert.ok(chapterJob.firstChapterError);
assert.equal(chapterField.elements.get("startQueueBtn").disabled, true);
assert.equal(chapterJob.firstChapterUrl, "", "Invalid drafts must not replace the saved URL");
chapterJob.ui.firstChapter.value = "https://example.com/novel/1/chapter-0#top";
chapterJob.ui.firstChapter.events.input();
assert.equal(chapterJob.firstChapterError, "");
assert.equal(chapterField.elements.get("startQueueBtn").disabled, false);
assert.equal(restoreQueue(queueSnapshot(chapterField.jobs))[0].firstChapterUrl, "https://example.com/novel/1/chapter-0");
vm.runInContext("loadViaNextLinkWalk = async (toc, first) => { globalThis.walkedFirst = first; await loadTocStub(toc); };", chapterField.context);
await chapterField.start();
assert.equal(chapterField.context.walkedFirst, "https://example.com/novel/1/chapter-0");
const clearedField = await setup();
clearedField.add(`${url(2)} | ${url(2)}/chapter-1`);
assert.equal(clearedField.jobs[0].ui.firstChapter.value, `${url(2)}/chapter-1`, "Legacy pipe input populates the field");
clearedField.jobs[0].ui.firstChapter.value = "";
clearedField.jobs[0].ui.firstChapter.events.input();
assert.equal(clearedField.jobs[0].firstChapterUrl, "");
console.log("First chapter field checks passed: validation, persistence, discovery routing, active-job lock, clearing, and legacy pipe input.");

// Gallery controller checks use authored page tokens, never live requests.
async function gallerySetup({ cancel = false, premiumChanges = false, onlyCompleted = false, completionChanges = false } = {}) {
  const test = await setup();
  const base = 'https://dreamy-translations.com/novel/';
  test.add(url('unrelated'));
  Object.assign(test.context, {
    DOMParser: class { parseFromString(value) { return value; } },
    scanEpubLibrary: async () => ({ titles: new Map([['owned', 'Owned.epub']]), sources: new Map(), count: 1, warnings: [] }),
    parseDreamyGallery: () => ['owned', 'hiatus', 'paid', 'unknown', 'failed', 'free'].map(id => ({ tocUrl: base + id, title: id === 'hiatus' ? 'Book (Hiatus)' : id })),
    parseDreamyNovel: token => {
      const id = token.split('/').pop();
      if (id === 'failed') throw new Error('Page failed');
      return { title: id, premium: id === 'paid' ? 20 : id === 'unknown' ? null : 0, free: 1, firstChapterUrl: base + id + '/chapter/0' };
    },
  });
  vm.runInContext(`fetchViaTab = async url => url; fetchPage = async url => url; sleep = async () => {};`, test.context);
  if (cancel) vm.runInContext('fetchViaTab = async url => { cancelRequested = true; return url; };', test.context);
  if (premiumChanges) vm.runInContext("fetchPage = async () => 'https://dreamy-translations.com/novel/paid';", test.context);
  test.elements.get('galleryUrl').value = 'https://dreamy-translations.com/series';
  test.elements.get('galleryEmptyLibrary').checked = true;
  test.elements.get('gallerySkipHiatus').checked = true;
  test.elements.get('galleryOnlyFree').checked = true;
  test.elements.get('galleryOnlyCompleted').checked = onlyCompleted;
  let completedChecks = 0;
  test.context.completedStub = async () => new Set(++completedChecks > 1 && completionChanges ? [] : [base + 'free']);
  vm.runInContext('loadCompletedGallery = completedStub', test.context);
  vm.runInContext("setMode('gallery')", test.context);
  assert.equal(test.elements.get('galleryWorkspace').hidden, false);
  assert.equal(test.elements.get('queueInputPanel').hidden, true);
  await vm.runInContext('scanGallery()', test.context);
  return test;
}
const gallery = await gallerySetup();
assert.equal(gallery.jobs.length, 2, 'Only eligible gallery book appended');
assert.equal(gallery.jobs[0].status, 'waiting', 'Unrelated queue entry not auto-started');
assert.deepEqual(gallery.compiled, ['free']);
assert.equal(gallery.jobs[1].galleryOnlyFree, true);
assert.equal(restoreQueue(queueSnapshot(gallery.jobs))[1].gallerySkipHiatus, true);
assert.match(gallery.elements.get('galleryStatus').textContent, /1 queued, 1 already in folder.*1 Hiatus, 0 not verified completed, 1 premium, 1 unverified, 1 failed/);
const cancelledGallery = await gallerySetup({ cancel: true });
assert.equal(cancelledGallery.jobs.length, 1, 'Cancelled scan adds no partial jobs');
assert.equal(cancelledGallery.compiled.length, 0);
assert.match(cancelledGallery.elements.get('galleryStatus').textContent, /Scan stopped/);
const changedGallery = await gallerySetup({ premiumChanges: true });
assert.equal(changedGallery.jobs[1].status, 'failed', 'Premium change blocks conversion');
assert.equal(changedGallery.compiled.length, 0);
assert.match(changedGallery.jobs[1].report.issues[0], /now has 20 premium/);
assert.throws(() => restoreQueue({ version: 1, jobs: [{ tocUrl: url(1), status: 'waiting', galleryOnlyFree: 'false' }] }), /gallery filters/);
console.log('Gallery controller checks passed: filters, queue isolation, cancellation, saved flags, and premium recheck.');

// Rendered Dreamy reader must fail on unavailable content rather than return a page shell.
const reader = (await import('../core/DreamyPage.js')).readDreamyPage;
for (const path of ['/series', '/novel/test', '/novel/test/chapter/0']) {
  let now = 0;
  const readerContext = vm.createContext({
    location: { pathname: path }, Date: { now: () => (now += 10000) },
    setTimeout: fn => fn(), document: { querySelector: () => null, querySelectorAll: () => [] },
  });
  await assert.rejects(vm.runInContext(`(${reader.toString()})()`, readerContext), /within 30 seconds/);
}
console.log('Dreamy reader timeout checks passed for gallery, index, and unavailable chapter.');

const completedGallery = await gallerySetup({ onlyCompleted: true });
assert.deepEqual(completedGallery.compiled, ['free']);
assert.equal(completedGallery.jobs[1].galleryOnlyCompleted, true);
assert.equal(restoreQueue(queueSnapshot(completedGallery.jobs))[1].galleryOnlyCompleted, true);
assert.match(completedGallery.elements.get('galleryStatus').textContent, /3 not verified completed/);
const noLongerCompleted = await gallerySetup({ onlyCompleted: true, completionChanges: true });
assert.equal(noLongerCompleted.compiled.length, 0);
assert.match(noLongerCompleted.jobs[1].report.issues[0], /not verified as completed/);
assert.throws(() => restoreQueue({ version: 1, jobs: [{ tocUrl: url(1), status: 'waiting', galleryOnlyCompleted: 'true' }] }), /gallery filters/);
console.log('Completed-only checks passed: optional filter, saved flags, exclusion, and recheck before download.');

let completionClock = 0;
const missingCompletionFilter = vm.createContext({
  location: { pathname: '/series' }, Date: { now: () => (completionClock += 10000) }, setTimeout: fn => fn(),
  document: { querySelector: () => ({}), querySelectorAll: () => [] },
});
await assert.rejects(vm.runInContext(`(${reader.toString()})(true)`, missingCompletionFilter), /Could not verify Dreamy's Completed filter/);
console.log('Missing completion filter fails closed.');
