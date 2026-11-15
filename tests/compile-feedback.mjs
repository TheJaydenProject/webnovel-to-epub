// Run with: node tests/compile-feedback.mjs
// Exercise the actual compile controller with browser/network boundaries stubbed.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { queueSnapshot, restoreQueue } from "../core/QueueState.js";

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
      querySelectorAll() { return (options.empty ? [] : chapters).map((c) => ({ dataset: { index: c.index } })); },
    };
  }
  let compiler;
  let downloads = 0;
  let filename;
  const context = vm.createContext({
    console, URL, URLSearchParams, crypto: webcrypto, queueSnapshot, restoreQueue, history: { replaceState() {} }, location: { search: "", href: "https://extension.example/ui/main.html" },
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
  vm.runInContext("state = testState; fetchImage = fetchImageStub; sleep = async () => {};", context);
  await vm.runInContext("runCompile()", context);
  assert.equal(listeners.size, 0, "download listener must be removed");
  assert.equal(elements.get("loadBtn").disabled, false);
  return {
    outcome: elements.get("compileResult").dataset.outcome,
    title: elements.get("resultTitle").textContent,
    counts: elements.get("resultCounts").textContent,
    issues: elements.get("resultIssues").children.map((li) => li.textContent).join("\n"),
    compiler, downloads, filename,
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
console.log("Compile feedback checks passed (16 scenarios).");
