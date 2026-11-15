// Authored metadata and chapters, all downloads captured in memory.
const tabs = new Map();
const storage = {};
let latestTab;
const downloaded = [];
const title = "Gallery Smoke Test";
window.browser = {
  runtime: { getManifest: () => ({ version: "0.5.0-test" }) },
  storage: { local: { get: async key => ({ [key]: storage[key] }), set: async data => Object.assign(storage, data) } },
  tabs: {
    create: async ({ url }) => { latestTab = { id: tabs.size + 1, url }; tabs.set(latestTab.id, latestTab); return latestTab; },
    remove: async () => {}, query: async () => [],
    onUpdated: { addListener: callback => queueMicrotask(() => callback(latestTab.id, { status: "complete" }, latestTab)), removeListener() {} },
  },
  scripting: { executeScript: async ({ target, args }) => {
    const path = new URL(tabs.get(target.tabId).url).pathname;
    let html;
    if (path === "/series") html = `<a href="/novel/test"><h3>${title}</h3></a><a href="/novel/skipped"><h3>Paused book (Hiatus)</h3></a>`;
    else if (path === "/novel/test") html = `<meta property="og:title" content="${title}"><h1>${title}</h1><button>Free (1)</button><button>Premium (0)</button><a data-chapter-index="0" href="/novel/test/chapter/0">Chapter 0</a>`;
    else if (path === "/novel/test/chapter/0") html = '<h1>Chapter 0</h1><article class="chapter-content"><p>This is a complete authored smoke-test chapter with enough text to exercise EPUB compilation.</p></article>';
    else throw new Error("Unexpected fixture URL: " + path);
    if (path === "/series") {
      if (args?.[0]) html = `<html data-epub-completed-filter="verified"><a href="/novel/test"><h3>${title}</h3></a></html>`;
      else html += '<a href="/novel/ongoing"><h3>Ongoing book</h3></a>';
    }
    return [{ result: html }];
  } },
  downloads: {
    onChanged: { addListener() {}, removeListener() {} },
    download: async data => { downloaded.push({ ...data, blob: await (await fetch(data.url)).blob() }); return downloaded.length; },
    search: async () => [{ state: "complete" }],
  },
};
window.addEventListener("load", async () => {
  const output = document.createElement("p");
  output.id = "smokeResult";
  output.setAttribute("role", "status");
  document.querySelector(".page").prepend(output);
  try {
    const el = id => document.getElementById(id);
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    el("galleryModeBtn").click();
    assert(!el("galleryWorkspace").hidden, "Gallery mode must open");
    assert(el("gallerySkipHiatus").checked && el("galleryOnlyFree").checked, "Both filters default on");
    assert(!el("galleryOnlyCompleted").checked, "Completed filter defaults off");
    el("galleryOnlyCompleted").click();
    el("galleryEmptyLibrary").click();
    el("galleryScanBtn").click();
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline && (!downloaded.length || el("galleryScanBtn").disabled)) await new Promise(resolve => setTimeout(resolve, 100));
    assert(downloaded.length === 1, "Exactly one eligible EPUB download");
    assert(el("queueSummary").textContent.includes("1 succeeded"), "Queue confirms successful download");
    assert(el("galleryStatus").textContent.includes("1 Hiatus"), "Hiatus reason reported");
    assert(!el("galleryStatus").textContent.includes("Starting new downloads"), "No stale starting message after completion");
    assert(document.documentElement.scrollWidth <= window.innerWidth, "Dashboard must fit its viewport");
    assert(el("galleryStatus").textContent.includes("1 not verified completed"), "Ongoing novels excluded");
    const zip = await JSZip.loadAsync(await downloaded[0].blob.arrayBuffer());
    const opf = await zip.file("OEBPS/content.opf").async("string");
    assert(opf.includes("<dc:source>https://dreamy-translations.com/novel/test</dc:source>"), "Download retains matching source");
    output.textContent = "PASS: actual dashboard gallery scan, default filters, queue, EPUB generation, and confirmed download (mock APIs).";
  } catch (err) { output.textContent = "FAIL: " + err.stack; }
});
