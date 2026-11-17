import "../browser-shim.js";
import { getConfigForUrl } from "../core/ParserRegistry.js";
import { extractChapterTitle, sanitizeChapterContent } from "../core/ContentSanitizer.js";
import { findLikelyContentElement } from "../core/ContentDetector.js";
import { EpubCompiler } from "../core/EpubCompiler.js";
import * as WuxiaworldApi from "../core/WuxiaworldApi.js";
import { parseQueueInput, validateNovelUrl } from "../core/QueueInput.js";
import { queueSnapshot, restoreQueue } from "../core/QueueState.js";
import { readMistmintPage } from "../core/MistmintHaven.js";
import { readDreamyPage } from "../core/DreamyPage.js";
import { validateGalleryUrl, canonicalDreamyNovelUrl, parseDreamyGallery, parseDreamyNovel, gallerySkipReason, scanEpubLibrary } from "../core/Gallery.js";

const els = {
  tocUrl: document.getElementById("tocUrl"),
  firstChapterUrl: document.getElementById("firstChapterUrl"),
  wuxiaToken: document.getElementById("wuxiaToken"),
  wuxiaAutoFillBtn: document.getElementById("wuxiaAutoFillBtn"),
  loadBtn: document.getElementById("loadBtn"),
  autoCompile: document.getElementById("autoCompile"),
  useTabFetch: document.getElementById("useTabFetch"),
  bookInfo: document.getElementById("bookInfo"),
  coverPreview: document.getElementById("coverPreview"),
  bookTitle: document.getElementById("bookTitle"),
  bookAuthor: document.getElementById("bookAuthor"),
  chapterSection: document.getElementById("chapterSection"),
  chapterList: document.getElementById("chapterList"),
  chapterSearch: document.getElementById("chapterSearch"),
  selectAllBtn: document.getElementById("selectAllBtn"),
  selectNoneBtn: document.getElementById("selectNoneBtn"),
  rangeFrom: document.getElementById("rangeFrom"),
  rangeTo: document.getElementById("rangeTo"),
  applyRangeBtn: document.getElementById("applyRangeBtn"),
  compileBtn: document.getElementById("compileBtn"),
  progressBar: document.getElementById("progressBar"),
  stopBtn: document.getElementById("stopBtn"),
  log: document.getElementById("log"),
  appVersion: document.getElementById("appVersion"),
  compileResult: document.getElementById("compileResult"),
  resultTitle: document.getElementById("resultTitle"),
  resultCounts: document.getElementById("resultCounts"),
  resultDetails: document.getElementById("resultDetails"),
  resultIssueCount: document.getElementById("resultIssueCount"),
  resultIssues: document.getElementById("resultIssues"),
  queueUrls: document.getElementById("queueUrls"),
  addQueueBtn: document.getElementById("addQueueBtn"),
  startQueueBtn: document.getElementById("startQueueBtn"),
  stopQueueBtn: document.getElementById("stopQueueBtn"),
  queueInputFeedback: document.getElementById("queueInputFeedback"),
  queueSummary: document.getElementById("queueSummary"),
  queueList: document.getElementById("queueList"),
  singleModeBtn: document.getElementById("singleModeBtn"),
  batchModeBtn: document.getElementById("batchModeBtn"),
  singleWorkspace: document.getElementById("singleWorkspace"),
  batchWorkspace: document.getElementById("batchWorkspace"),
  pauseQueueBtn: document.getElementById("pauseQueueBtn"),
  queueOverallProgress: document.getElementById("queueOverallProgress"),
  queueActivity: document.getElementById("queueActivity"),
  queueActiveTitle: document.getElementById("queueActiveTitle"),
  queueActiveStep: document.getElementById("queueActiveStep"),
  queueNovelProgress: document.getElementById("queueNovelProgress"),
  queueSaveStatus: document.getElementById("queueSaveStatus"),
  attentionOnly: document.getElementById("attentionOnly"),
  queueFilterEmpty: document.getElementById("queueFilterEmpty"),
  queueInputPanel: document.getElementById("queueInputPanel"),
};

for (const id of ["copyLogBtn", "showFileBtn", "selectionCount", "galleryModeBtn", "galleryWorkspace", "galleryUrl", "galleryFolder", "galleryFolderStatus", "galleryEmptyLibrary", "gallerySkipHiatus", "galleryOnlyFree", "galleryOnlyCompleted", "galleryScanBtn", "galleryStopBtn", "galleryStatus", "galleryProgress", "galleryReport", "galleryResults"]) {
  els[id] = document.getElementById(id);
}

els.appVersion.textContent = `v${browser.runtime.getManifest().version}`;

const EXT_FOR_MIME = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/avif": "avif",
};

let state = {
  config: null,
  novelTitle: "",
  author: "",
  coverUrl: null,
  chapters: [],
};

// In-memory cache of fetched pages/images, keyed by URL. Single-novel runs
// reuse fetched content until reload. Queue jobs clear it between novels
// so a long queue does not retain every book's pages and image blobs.
const pageCache = new Map(); // url -> html string
const imageCache = new Map(); // url -> { blob, ext }

const THROTTLE_MAX_MULTIPLIER = 8;

// Doubles the per-request delay (capped) when a site responds with an
// explicit rate-limit/overload signal, similar in spirit to Scrapling's
// AutoThrottle - without per-domain response-time tracking, just a simple
// multiplier that grows on trouble and decays back to normal on success.
function bumpThrottle(fetchState, status) {
  const next = Math.min((fetchState.throttleMultiplier ?? 1) * 2, THROTTLE_MAX_MULTIPLIER);
  if (next !== fetchState.throttleMultiplier) {
    log(`  Got HTTP ${status} - slowing down (delay x${next.toFixed(1)}).`);
  }
  fetchState.throttleMultiplier = next;
}

function decayThrottle(fetchState) {
  fetchState.throttleMultiplier = Math.max(1, (fetchState.throttleMultiplier ?? 1) * 0.85);
}

// Safety cap for "next chapter" link-walking discovery, in case of a
// misconfigured selector that never terminates. Cycle detection (the
// `seen` set) and the Stop button are the main safeguards - this is just
// a last resort so it's effectively never hit for real novels.
const MAX_CHAPTERS = 10000;

// Set by the Stop button; checked between steps of the discovery walk and
// the compile loop so either can be cut short while keeping whatever was
// found/compiled so far.
let cancelRequested = false;
let operationRunning = false;
let queueRunning = false;
let queueStopRequested = false;
let activeQueueJob = null;
const novelQueue = [];
let queueReady = false;
let saveChain = Promise.resolve();
const queueStorageKey = `novelQueue:${crypto.randomUUID()}`;

function setMode(mode) {
  if (operationRunning) return;
  const gallery = mode === "gallery";
  const batch = mode === true;
  els.singleWorkspace.hidden = batch || gallery;
  els.batchWorkspace.hidden = !batch && !gallery;
  els.galleryWorkspace.hidden = !gallery;
  els.queueInputPanel.hidden = gallery;
  els.stopBtn.hidden = batch || gallery;
  els.singleModeBtn.setAttribute("aria-pressed", String(!batch && !gallery));
  els.batchModeBtn.setAttribute("aria-pressed", String(batch));
  els.galleryModeBtn.setAttribute("aria-pressed", String(gallery));
  els.compileResult.hidden = true;
}
els.singleModeBtn.addEventListener("click", () => setMode(false));
els.batchModeBtn.addEventListener("click", () => setMode(true));
els.galleryModeBtn.addEventListener("click", () => setMode("gallery"));
els.attentionOnly.addEventListener("change", filterQueue);
els.pauseQueueBtn.addEventListener("click", () => {
  queueStopRequested = true;
  updateQueueSummary();
  saveQueue();
});

function saveQueue() {
  if (!queueReady) return saveChain;
  const snapshot = queueSnapshot(novelQueue);
  // Serialize writes so an older snapshot cannot overwrite a finished report.
  saveChain = saveChain.then(async () => {
    await browser.storage.local.set({ [queueStorageKey]: snapshot, latestNovelQueue: queueStorageKey });
    els.queueSaveStatus.textContent = "";
  }).catch((err) => {
    els.queueSaveStatus.textContent = `Could not save the queue: ${err.message}. Keep this tab open to retain these results.`;
  });
  return saveChain;
}

async function initializeQueue() {
  els.addQueueBtn.disabled = true;
  try {
    const pointer = await browser.storage.local.get("latestNovelQueue");
    const sourceKey = params.get("queue") || pointer.latestNovelQueue;
    if (typeof sourceKey === "string" && sourceKey.startsWith("novelQueue:")) {
      const saved = await browser.storage.local.get(sourceKey);
      if (saved[sourceKey]) {
        for (const job of restoreQueue(saved[sourceKey])) appendQueueJob(job);
        queueStopRequested = novelQueue.some((job) => job.status === "paused");
        els.queueInputPanel.open = novelQueue.length === 0;
        els.queueInputFeedback.textContent = "Saved queue restored. Unfinished novels are paused and restart from the beginning when continued. A download interrupted at closing may already exist.";
        if (!params.get("url")) setMode(true);
      }
    }
    // Each dashboard owns its snapshot, including when a saved URL is opened
    // twice. This prevents two tabs from overwriting each other's reports.
    queueReady = true;
    if (novelQueue.length) await saveQueue();
  } catch (err) {
    els.queueSaveStatus.textContent = `Could not restore the queue: ${err.message}`;
  } finally {
    const url = new URL(location.href);
    url.searchParams.set("queue", queueStorageKey);
    history.replaceState(null, "", url.href);
    queueReady = true;
    els.addQueueBtn.disabled = false;
    updateQueueSummary();
  }
}

function requestStop() {
  cancelRequested = true;
  if (queueRunning) queueStopRequested = true;
  els.stopBtn.disabled = true;
  els.stopQueueBtn.disabled = true;
  log("Stop requested - finishing up with what's been found so far...");
  if (queueRunning) updateQueueSummary();
}
els.stopBtn.addEventListener("click", requestStop);
els.stopQueueBtn.addEventListener("click", requestStop);

const params = new URLSearchParams(location.search);
if (params.get("url")) els.tocUrl.value = params.get("url");
const queueInitialization = initializeQueue();

// Persist the WuxiaWorld API token locally so it doesn't need re-pasting
// every time (it's only re-entered when it expires, ~30 days).
browser.storage.local.get("wuxiaApiToken").then((result) => {
  if (result.wuxiaApiToken) els.wuxiaToken.value = result.wuxiaApiToken;
});
els.wuxiaToken.addEventListener("change", () => {
  browser.storage.local.set({ wuxiaApiToken: els.wuxiaToken.value.trim() });
});

// Reads the WuxiaWorld SPA's OIDC access token out of an open (or freshly
// opened, background) wuxiaworld.com tab's storage - the same token used
// for its own API calls when the user is logged in there.
async function readWuxiaTokenFromTab(debug) {
  let tab;
  let openedNewTab = false;
  try {
    debug.push("Looking for an open wuxiaworld.com tab...");
    const existing = await browser.tabs.query({ url: "*://*.wuxiaworld.com/*" });
    tab = existing[0];
    if (tab) {
      debug.push(`Found existing tab #${tab.id}: ${tab.url}`);
    } else {
      debug.push("None found. Opening a new background tab...");
      tab = await browser.tabs.create({ url: "https://www.wuxiaworld.com/", active: false });
      openedNewTab = true;
      debug.push(`Opened tab #${tab.id}. Waiting for it to finish loading...`);
      await waitForTabLoad(tab.id);
      debug.push("Tab finished loading. Waiting 1s for hydration...");
      await sleep(1000);
    }
  } catch (err) {
    debug.push(`ERROR while opening/finding tab: ${err.name}: ${err.message}`);
    console.error("[wuxiaAutoFill] couldn't open a wuxiaworld.com tab", err);
    throw new Error(`couldn't open a wuxiaworld.com tab (${err.message})`);
  }

  try {
    debug.push(`Running executeScript on tab #${tab.id} (url: ${tab.url})...`);
    const results = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const keysSeen = [];
        for (const storage of [localStorage, sessionStorage]) {
          for (let i = 0; i < storage.length; i++) {
            const key = storage.key(i);
            keysSeen.push(key);
            try {
              const data = JSON.parse(storage.getItem(key));
              if (typeof data?.access_token === "string") return { token: data.access_token, keysSeen };
            } catch {
              // Not JSON, or not the entry we're looking for - skip it.
            }
          }
        }
        return { token: null, keysSeen };
      },
    });
    const { token, keysSeen } = results[0]?.result ?? { token: null, keysSeen: [] };
    debug.push(`executeScript ok. Storage keys seen: ${keysSeen.length ? keysSeen.join(", ") : "(none)"}`);
    debug.push(token ? "Found access_token." : "No access_token found in any storage entry.");
    return token;
  } catch (err) {
    debug.push(`ERROR during executeScript: ${err.name}: ${err.message}`);
    console.error("[wuxiaAutoFill] couldn't read page storage", err);
    throw new Error(`couldn't read page storage (${err.message})`);
  } finally {
    if (openedNewTab) {
      debug.push(`Closing temporary tab #${tab.id}`);
      await browser.tabs.remove(tab.id).catch(() => {});
    }
  }
}

els.wuxiaAutoFillBtn.addEventListener("click", async () => {
  els.wuxiaAutoFillBtn.disabled = true;
  const debug = [];
  try {
    const token = await readWuxiaTokenFromTab(debug);
    if (token) {
      els.wuxiaToken.value = token;
      await browser.storage.local.set({ wuxiaApiToken: token });
      log("Auto-fill: WuxiaWorld API token filled in from your browser session.");
    } else {
      log("Auto-fill: No WuxiaWorld login session found. Make sure you are logged in to wuxiaworld.com in this browser, then try again.");
      log("Auto-fill debug: " + debug.join(" | "));
    }
  } catch (err) {
    console.error("[wuxiaAutoFill]", err, "\nDebug log:\n" + debug.join("\n"));
    log(`Auto-fill failed: ${err.message}`);
    log("Auto-fill debug: " + debug.join(" | "));
  } finally {
    els.wuxiaAutoFillBtn.disabled = false;
  }
});

// Appending to textContent re-serializes the whole log on every line, which
// gets slow on multi-thousand-chapter runs. Show a bounded tail; keep the
// full run for Copy log so bug reports stay complete.
const LOG_DISPLAY_LINES = 1000;
const LOG_KEEP_LINES = 50000;
let logLines = [];

function log(message) {
  logLines.push(message);
  if (logLines.length > LOG_KEEP_LINES) logLines = logLines.slice(-LOG_KEEP_LINES);
  els.log.textContent = logLines.slice(-LOG_DISPLAY_LINES).join("\n") + "\n";
  els.log.scrollTop = els.log.scrollHeight;
  if (activeQueueJob) activeQueueJob.ui.progress.textContent = message;
}

function clearLog() {
  logLines = [];
  els.log.textContent = "";
}

els.copyLogBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(logLines.join("\n"));
    els.copyLogBtn.textContent = "Copied";
  } catch (err) {
    els.copyLogBtn.textContent = "Copy failed";
    console.error("[copyLog]", err);
  }
  setTimeout(() => { els.copyLogBtn.textContent = "Copy log"; }, 1500);
});

const APP_TITLE = "Web Novel to EPUB";
// Mirrors progress in the tab title so a run can be watched from other tabs.
function setTabStatus(text) {
  document.title = text ? `${text} · ${APP_TITLE}` : APP_TITLE;
}

// Closing the dashboard mid-run discards everything fetched so far.
globalThis.addEventListener?.("beforeunload", (event) => {
  if (!operationRunning) return;
  event.preventDefault();
  event.returnValue = "";
});

// Fetching toggles are remembered between sessions.
browser.storage.local.get("settings").then(({ settings }) => {
  if (typeof settings?.useTabFetch === "boolean") els.useTabFetch.checked = settings.useTabFetch;
  if (typeof settings?.autoCompile === "boolean") els.autoCompile.checked = settings.autoCompile;
}).catch((err) => console.error("[settings]", err));
for (const toggle of [els.useTabFetch, els.autoCompile]) {
  toggle.addEventListener("change", () => {
    browser.storage.local.set({ settings: { useTabFetch: els.useTabFetch.checked, autoCompile: els.autoCompile.checked } })
      .catch((err) => log(`Could not save settings: ${err.message}`));
  });
}

for (const input of [els.tocUrl, els.firstChapterUrl]) {
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !operationRunning) els.loadBtn.click();
  });
}
for (const input of [els.rangeFrom, els.rangeTo]) {
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") els.applyRangeBtn.click();
  });
}

els.coverPreview.addEventListener("error", () => { els.coverPreview.hidden = true; });

let lastDownloadId = null;
els.showFileBtn.addEventListener("click", () => {
  if (lastDownloadId !== null) browser.downloads.show(lastDownloadId);
});

function showLoadError(message) {
  els.compileResult.dataset.outcome = "failed";
  els.compileResult.hidden = false;
  els.resultTitle.textContent = "Could not load this novel";
  els.resultCounts.textContent = message;
  els.resultDetails.hidden = true;
  els.showFileBtn.hidden = true;
  setTabStatus("Failed");
}

function setBusy(busy) {
  operationRunning = busy;
  for (const el of [els.loadBtn, els.compileBtn, els.tocUrl, els.firstChapterUrl,
    els.wuxiaToken, els.wuxiaAutoFillBtn, els.useTabFetch, els.autoCompile,
    els.selectAllBtn, els.selectNoneBtn, els.rangeFrom, els.rangeTo, els.applyRangeBtn,
    els.singleModeBtn, els.batchModeBtn, els.galleryModeBtn, els.galleryUrl,
    els.galleryFolder, els.galleryEmptyLibrary, els.gallerySkipHiatus, els.galleryOnlyFree, els.galleryOnlyCompleted, els.galleryScanBtn]) {
    el.disabled = busy;
  }
  els.galleryFolder.disabled = busy || els.galleryEmptyLibrary.checked;
  els.chapterList.querySelectorAll("input[type=checkbox]").forEach((cb) => { cb.disabled = busy; });
  for (const job of novelQueue) job.ui.retry.disabled = busy || !!job.firstChapterError;
  updateQueueSummary();
  updateSelectionCount();
}

function updateQueueSummary() {
  const count = (status) => novelQueue.filter((job) => job.status === status).length;
  const pending = count("waiting") + count("paused");
  const prefix = queueRunning ? queueStopRequested ? cancelRequested ? "Stopping the current novel, then pausing." : "Pausing after this novel finishes." : "Queue running."
    : pending ? queueStopRequested ? "Queue paused." : "Ready to start." : novelQueue.length ? "Queue finished." : "No novels queued.";
  els.queueSummary.textContent = novelQueue.length
    ? `${prefix} ${count("success")} succeeded, ${count("warning")} with warnings, ${count("failed")} failed, ${count("stopped")} stopped, ${pending} waiting.`
    : prefix;
  els.startQueueBtn.disabled = !queueReady || operationRunning || !pending || novelQueue.some(job => ["waiting", "paused"].includes(job.status) && job.firstChapterError);
  els.galleryScanBtn.disabled = !queueReady || operationRunning;
  els.startQueueBtn.textContent = queueStopRequested ? "Continue queue" : "Start queue";
  els.stopQueueBtn.disabled = !queueRunning || cancelRequested;
  els.pauseQueueBtn.disabled = !queueRunning || queueStopRequested;
  els.queueOverallProgress.max = Math.max(1, novelQueue.length);
  els.queueOverallProgress.value = novelQueue.filter((job) => ["success", "warning", "failed", "stopped"].includes(job.status)).length;
  filterQueue();
}

function filterQueue() {
  let visible = 0;
  for (const job of novelQueue) {
    job.ui.row.hidden = els.attentionOnly.checked && !["warning", "failed", "stopped", "paused"].includes(job.status);
    if (!job.ui.row.hidden) visible++;
  }
  els.queueFilterEmpty.hidden = !els.attentionOnly.checked || visible > 0;
}

function updateNovelProgress(step, completed, total) {
  if (!activeQueueJob) return;
  els.queueActivity.hidden = false;
  els.queueActiveTitle.textContent = `Novel ${novelQueue.indexOf(activeQueueJob) + 1} of ${novelQueue.length}: ${activeQueueJob.customTitle || activeQueueJob.title || activeQueueJob.tocUrl}`;
  els.queueActiveStep.textContent = step;
  if (total) {
    els.queueNovelProgress.max = total;
    els.queueNovelProgress.value = completed;
  } else {
    els.queueNovelProgress.removeAttribute("value");
  }
}

function renderQueueJob(job) {
  job.ui.row.dataset.status = job.status;
  const sourceName = job.tocUrl ? new URL(job.tocUrl).pathname.split("/").filter(Boolean).pop()?.replace(/[-_]/g, " ") || new URL(job.tocUrl).hostname : "Invalid entry";
  job.ui.title.textContent = `${novelQueue.indexOf(job) + 1}. ${job.customTitle || job.title || sourceName}`;
  job.ui.name.placeholder = job.title || "Use the name detected from the site";
  job.ui.name.disabled = ["compiling", "success"].includes(job.status) || !!job.error;
  job.ui.firstChapter.disabled = ["loading", "compiling", "success"].includes(job.status) || !!job.error;
  job.ui.firstChapter.setAttribute("aria-invalid", String(!!job.firstChapterError));
  job.ui.firstChapterError.textContent = job.firstChapterError || "";
  job.ui.firstChapterError.hidden = !job.firstChapterError;
  job.ui.url.textContent = job.tocUrl || "";
  job.ui.status.textContent = {
    waiting: "Waiting", paused: "Paused", loading: "Discovering", compiling: "Converting",
    success: "Success", warning: "Warnings", failed: "Failed", stopped: "Stopped",
  }[job.status];
  job.ui.counts.textContent = job.report ? reportCounts(job.report) : "";
  job.ui.progress.hidden = !["waiting", "loading", "compiling"].includes(job.status);
  job.ui.issues.replaceChildren();
  const issues = job.report?.issues || (job.error ? [job.error] : []);
  for (const issue of issues) {
    const li = document.createElement("li");
    li.textContent = issue;
    job.ui.issues.appendChild(li);
  }
  job.ui.compactCount.textContent = job.report ? `${job.report.compiled}/${job.report.selected} chapters` : "";
  job.ui.details.hidden = false;
  job.ui.summary.textContent = issues.length ? `Details (${issues.length} issues)` : "Details";
  job.ui.retry.hidden = !["failed", "warning", "stopped"].includes(job.status) || !!job.error;
  job.ui.retry.disabled = operationRunning || !!job.firstChapterError;
  updateQueueSummary();
}

function appendQueueJob(entry) {
    const job = { ...entry, status: entry.status || (entry.error ? "failed" : "waiting"), report: entry.report || null, ui: {} };
    for (const [key, tag] of Object.entries({ row: "li", header: "div", title: "h3", nameLabel: "label", name: "input", firstChapterLabel: "label", firstChapter: "input", firstChapterError: "span", compactCount: "span", url: "p", status: "p", progress: "p", counts: "p", details: "details", summary: "summary", issues: "ul", retry: "button" })) {
      job.ui[key] = document.createElement(tag);
    }
    job.ui.row.className = "queue-job";
    job.ui.header.className = "queue-job-header";
    job.ui.url.className = "queue-url";
    job.ui.status.className = "queue-status";
    job.ui.progress.className = "queue-progress";
    job.ui.nameLabel.className = "queue-name";
    job.ui.nameLabel.textContent = "Novel name (optional)";
    job.ui.name.type = "text";
    job.ui.name.value = job.customTitle || "";
    job.ui.nameLabel.appendChild(job.ui.name);
    job.ui.name.addEventListener("input", () => {
      if (job.ui.name.disabled) return;
      job.customTitle = job.ui.name.value.trim();
      renderQueueJob(job);
      if (activeQueueJob === job) updateNovelProgress(els.queueActiveStep.textContent);
      saveQueue();
    });
    job.ui.retry.className = "btn btn-secondary";
    job.ui.firstChapterLabel.className = "queue-name";
    job.ui.firstChapterLabel.textContent = "First chapter URL (optional)";
    job.ui.firstChapter.type = "url";
    job.ui.firstChapter.placeholder = "https://example.com/novel/chapter-1";
    job.ui.firstChapter.value = job.firstChapterUrl || "";
    job.ui.firstChapterError.id = `chapter-url-error-${crypto.randomUUID()}`;
    job.ui.firstChapterError.className = "queue-field-error";
    job.ui.firstChapterError.setAttribute("aria-live", "polite");
    job.ui.firstChapter.setAttribute("aria-describedby", job.ui.firstChapterError.id);
    job.ui.firstChapterLabel.append(job.ui.firstChapter, job.ui.firstChapterError);
    job.ui.firstChapter.addEventListener("input", () => {
      if (job.ui.firstChapter.disabled) return;
      try {
        const value = job.ui.firstChapter.value.trim();
        job.firstChapterUrl = value ? validateNovelUrl(value) : "";
        job.firstChapterError = "";
        saveQueue();
      } catch (err) {
        // Keep the last valid URL in storage, but never run with an invalid draft.
        job.firstChapterError = err.message;
      }
      renderQueueJob(job);
    });
    job.ui.retry.textContent = "Queue retry";
    job.ui.retry.addEventListener("click", () => {
      if (operationRunning || job.firstChapterError) return;
      job.status = "waiting";
      job.ui.progress.textContent = "Queued for another attempt. Previous report retained until it starts.";
      renderQueueJob(job);
      saveQueue();
    });
    job.ui.header.append(job.ui.title, job.ui.status, job.ui.compactCount);
    job.ui.details.append(job.ui.summary, job.ui.url, job.ui.counts, job.ui.issues, job.ui.retry);
    job.ui.row.append(job.ui.header, job.ui.nameLabel, job.ui.firstChapterLabel, job.ui.progress, job.ui.details);
    novelQueue.push(job);
    els.queueList.appendChild(job.ui.row);
    renderQueueJob(job);
    return job;
}

els.addQueueBtn.addEventListener("click", () => {
  if (!queueReady) return;
  const entries = parseQueueInput(els.queueUrls.value);
  let added = 0;
  let duplicates = 0;
  let invalid = 0;
  for (const entry of entries) {
    if (!entry.error && novelQueue.some((job) => job.tocUrl === entry.tocUrl && job.firstChapterUrl === entry.firstChapterUrl)) {
      duplicates++;
      continue;
    }
    if (entry.error) invalid++;
    appendQueueJob(entry);
    added++;
  }
  els.queueInputFeedback.textContent = entries.length
    ? `Added ${added} entry(s). ${duplicates} duplicate(s) skipped.${invalid ? ` ${invalid} invalid entry(s) listed below. Correct those URLs and add them again.` : ""}`
    : "Paste at least one novel index URL, one per line.";
  els.queueUrls.value = "";
  saveQueue();
});

els.startQueueBtn.addEventListener("click", runQueue);

async function runQueue({ onlyJobs = null } = {}) {
  if (!queueReady || operationRunning || !novelQueue.some((job) => ["waiting", "paused"].includes(job.status))) return;
  queueRunning = true;
  queueStopRequested = false;
  els.queueInputPanel.open = false;
  setBusy(true);
  try {
    for (const job of novelQueue) {
      if (queueStopRequested) break;
      if (onlyJobs && !onlyJobs.includes(job)) continue;
      if (!["waiting", "paused"].includes(job.status)) continue;
      activeQueueJob = job;
      job.report = null;
      job.status = "loading";
      cancelRequested = false;
      job.ui.progress.textContent = "Loading novel details...";
      renderQueueJob(job);
      updateNovelProgress("Discovering chapters...");
      await saveQueue();
      pageCache.clear();
      imageCache.clear();
      els.stopBtn.disabled = false;
      try {
        if (job.firstChapterError) throw new Error(`First chapter URL: ${job.firstChapterError}`);
        await checkGalleryJob(job);
        if (cancelRequested) throw new Error("Stopped during gallery filter verification. No EPUB was downloaded.");
        await loadNovel(job.tocUrl, job.firstChapterUrl);
        job.title = state.novelTitle;
        state.outputTitle = job.customTitle || state.novelTitle;
        if (cancelRequested) {
          job.status = "stopped";
          job.report = newCompileReport();
          job.report.issues.push("Stopped during chapter discovery. No EPUB was downloaded. Retry this novel to start it again.");
        } else {
          job.status = "compiling";
          renderQueueJob(job);
          updateNovelProgress(`Preparing ${state.chapters.length} chapters...`, 0, state.chapters.length);
          await saveQueue();
          job.report = await runCompile({ queued: true });
          job.status = job.report.stopped ? "stopped" : reportOutcome(job.report);
        }
      } catch (err) {
        job.status = cancelRequested ? "stopped" : "failed";
        job.report = newCompileReport();
        job.report.issues.push(`Could not load this novel: ${err.message}`);
        log(job.report.issues.at(-1));
      }
      renderQueueJob(job);
      await saveQueue();
      activeQueueJob = null;
    }
  } finally {
    activeQueueJob = null;
    queueRunning = false;
    els.queueActivity.hidden = true;
    setTabStatus(queueStopRequested ? "Queue paused" : "Queue finished");
    pageCache.clear();
    imageCache.clear();
    els.stopBtn.disabled = true;
    setBusy(false);
    await saveQueue();
  }
}

async function checkGalleryJob(job) {
  if (!job.galleryOnlyFree && !job.gallerySkipHiatus && !job.galleryOnlyCompleted) return;
  if (!canonicalDreamyNovelUrl(job.tocUrl)) throw new Error("Gallery filter checks require a Dreamy novel URL.");
  if (job.galleryOnlyCompleted) {
    const completed = await loadCompletedGallery("https://dreamy-translations.com/series");
    if (!completed.has(canonicalDreamyNovelUrl(job.tocUrl))) throw new Error("Gallery filter: this novel is not verified as completed.");
  }
  const doc = new DOMParser().parseFromString(await fetchPage(job.tocUrl), "text/html");
  const details = parseDreamyNovel(doc, job.tocUrl);
  if (job.gallerySkipHiatus && /\(\s*hiatus\s*\)/i.test(details.title)) throw new Error("Gallery filter: this novel is now marked (Hiatus).");
  if (job.galleryOnlyFree && details.premium !== 0) throw new Error(details.premium == null
    ? "Gallery filter: could not verify zero premium chapters."
    : `Gallery filter: this novel now has ${details.premium} premium chapters.`);
}

els.galleryFolder.addEventListener("change", () => {
  const files = Array.from(els.galleryFolder.files || []);
  const count = files.filter(file => /\.epub$/i.test(file.name)).length;
  els.galleryFolderStatus.textContent = files.length ? `${files[0].webkitRelativePath?.split("/")[0] || "Selected folder"}: ${count} EPUB files found.` : "No files selected. For an empty folder, choose Start with an empty library.";
});
els.galleryEmptyLibrary.addEventListener("change", () => {
  els.galleryFolder.disabled = els.galleryEmptyLibrary.checked;
});
els.galleryStopBtn.addEventListener("click", () => {
  cancelRequested = true;
  els.galleryStopBtn.disabled = true;
  els.galleryStatus.textContent = "Stopping after the current read. No partial scan will start downloads.";
});
els.galleryScanBtn.addEventListener("click", scanGallery);

async function scanGallery() {
  await queueInitialization;
  if (operationRunning) return;
  setBusy(true);
  cancelRequested = false;
  els.galleryStopBtn.disabled = false;
  els.galleryResults.replaceChildren();
  els.galleryReport.hidden = false;
  els.galleryProgress.removeAttribute("value");
  const addedJobs = [];
  const counts = {};
  const addResult = (title, status, reason) => {
    counts[status] = (counts[status] || 0) + 1;
    const item = document.createElement("li");
    item.textContent = `${title}: ${reason}`;
    els.galleryResults.appendChild(item);
  };
  try {
    const url = validateGalleryUrl(els.galleryUrl.value.trim());
    const files = Array.from(els.galleryFolder.files || []);
    if (!els.galleryEmptyLibrary.checked && !files.length) throw new Error("Choose your EPUB folder, or select Start with an empty library.");
    const options = { skipHiatus: els.gallerySkipHiatus.checked, onlyFree: els.galleryOnlyFree.checked, onlyCompleted: els.galleryOnlyCompleted.checked };
    const library = await scanEpubLibrary(els.galleryEmptyLibrary.checked ? [] : files, {
      cancelled: () => cancelRequested,
      onProgress: (done, total, name) => {
        els.galleryStatus.textContent = `Reading EPUB ${done} of ${total}: ${name}`;
        els.galleryProgress.max = total;
        els.galleryProgress.value = done;
      },
    });
    for (const warning of library.warnings) addResult("Library warning", "libraryWarning", warning);
    if (cancelRequested) return;
    els.galleryStatus.textContent = "Loading Dreamy's gallery...";
    pageCache.clear();
    const gallery = new DOMParser().parseFromString(await fetchViaTab(url), "text/html");
    const novels = parseDreamyGallery(gallery, url);
    if (options.onlyCompleted) {
      els.galleryStatus.textContent = "Checking Dreamy's Completed gallery...";
      const completed = await loadCompletedGallery(url);
      for (const novel of novels) novel.completed = completed.has(novel.tocUrl);
    }
    const queuedUrls = new Set(novelQueue.map(job => canonicalDreamyNovelUrl(job.tocUrl)).filter(Boolean));
    const ready = [];
    els.galleryProgress.max = novels.length;
    for (const [i, novel] of novels.entries()) {
      if (cancelRequested) break;
      els.galleryStatus.textContent = `Checking novel ${i + 1} of ${novels.length}: ${novel.title}`;
      let skip = gallerySkipReason(novel, library, queuedUrls, { ...options, onlyFree: false });
      if (!skip) {
        try {
          const doc = new DOMParser().parseFromString(await fetchViaTab(novel.tocUrl), "text/html");
          const details = parseDreamyNovel(doc, novel.tocUrl);
          Object.assign(novel, details);
          skip = gallerySkipReason(novel, library, queuedUrls, options);
          if (!skip && (!details.firstChapterUrl || details.free === 0)) skip = { status: "empty", reason: "Skipped: no available chapters" };
          if (!skip) {
            ready.push({ tocUrl: novel.tocUrl, firstChapterUrl: details.premium === 0 ? "" : details.firstChapterUrl,
              title: novel.title, galleryOnlyFree: options.onlyFree, gallerySkipHiatus: options.skipHiatus, galleryOnlyCompleted: options.onlyCompleted });
            queuedUrls.add(novel.tocUrl);
          }
        } catch (err) {
          skip = { status: "failed", reason: `Check failed: ${err.message}` };
        } finally {
          pageCache.delete(novel.tocUrl);
        }
        if (!cancelRequested) await sleep(politeDelay(getConfigForUrl(novel.tocUrl)));
      }
      addResult(novel.title, skip?.status || "ready", skip?.reason || "Eligible for download");
      els.galleryProgress.value = i + 1;
    }
    if (cancelRequested) return;
    for (const entry of ready) addedJobs.push(appendQueueJob(entry));
    await saveQueue();
    els.queueInputPanel.open = false;
    els.galleryStatus.textContent = `Scanned ${library.count} EPUBs and ${novels.length} novels. ${ready.length} queued, ${counts.existing || 0} already in folder, ${counts.queued || 0} already queued, ${counts.hiatus || 0} Hiatus, ${counts.notCompleted || 0} not verified completed, ${counts.premium || 0} premium, ${counts.unknown || 0} unverified, ${counts.failed || 0} failed checks, ${counts.empty || 0} without chapters. ${library.warnings.length} library warnings.${ready.length ? " Starting new downloads below." : " Nothing new to download."}`;
  } catch (err) {
    els.galleryStatus.textContent = `Gallery scan failed: ${err.message}`;
  } finally {
    if (cancelRequested) els.galleryStatus.textContent = "Scan stopped. No novels from this scan were queued or downloaded. Run the scan again when ready.";
    pageCache.clear();
    els.galleryStopBtn.disabled = true;
    setBusy(false);
  }
  if (addedJobs.length) {
    await runQueue({ onlyJobs: addedJobs });
    els.galleryStatus.textContent = els.galleryStatus.textContent.replace("Starting new downloads below.", "See the queue below for download results and any paused novels.");
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function politeDelay(config, fetchState) {
  const base = config.fetchIntervalBase ?? 1000;
  const jitter = config.fetchJitterRange ?? 0;
  const multiplier = fetchState?.throttleMultiplier ?? 1;
  return (base + Math.random() * jitter) * multiplier;
}

// downloads.download rejects names Windows cannot store, which would throw
// away a finished EPUB at the very last step, so clean them up front.
function sanitizeFilename(name) {
  let clean = name
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/[\\/:*?"<>|~]+/g, "_")
    .replace(/\s+/g, " ")
    .replace(/^[\s.]+|[\s.]+$/g, "");
  // Leave room for ".epub" and a browser "(1)" suffix within the 255-char limit.
  clean = clean.slice(0, 150).replace(/[\s.]+$/, "");
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(clean)) clean = `${clean}_`;
  return clean || "book";
}

async function fetchImage(url, fetchState) {
  if (imageCache.has(url)) return imageCache.get(url);
  let res;
  try {
    res = await fetch(url, { credentials: "include", signal: AbortSignal.timeout(60000) });
  } catch (err) {
    if (err.name === "TimeoutError") throw new Error("Image request timed out after 60 seconds");
    // Many image CDNs (S3, Supabase, etc.) send a wildcard
    // `Access-Control-Allow-Origin: *`, which browsers reject outright for
    // credentialed requests - retry without cookies for those.
    res = await fetch(url, { signal: AbortSignal.timeout(60000) });
  }
  if (res.status === 429 || res.status === 503) bumpThrottle(fetchState, res.status);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const mime = res.headers.get("content-type")?.split(";")[0].trim().toLowerCase() || "";
  // Hotlink protection often answers 200 with an HTML page; packaging that
  // as a .jpg ships a broken image instead of reporting it.
  if (mime && !mime.startsWith("image/") && mime !== "application/octet-stream") {
    throw new Error(`Not an image (${mime})`);
  }
  const blob = await res.blob();
  const ext = EXT_FOR_MIME[mime] || "jpg";
  const result = { blob, ext };
  imageCache.set(url, result);
  return result;
}

async function fetchFast(url) {
  if (pageCache.has(url)) return pageCache.get(url);
  const res = await fetch(url, { credentials: "include", cache: "no-store", signal: AbortSignal.timeout(60000) });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const html = await res.text();
  pageCache.set(url, html);
  return html;
}

// Fetches a page's HTML. Normally a plain `fetch` is used, but extension
// `fetch` requests are cross-site, so sites that gate content behind a
// `SameSite=Lax/Strict` login cookie won't see the user as logged in. When
// "Use browser tab for fetching" is checked, the page is instead loaded in
// a real background tab (a same-site navigation, so the user's normal
// session cookies apply) and its rendered HTML is read back out.
async function fetchPage(url) {
  if (els.useTabFetch.checked || getConfigForUrl(url).requiresTabFetch) return fetchViaTab(url);
  return fetchFast(url);
}

// Locates a chapter's content container: the configured selector if it
// matches, otherwise ContentDetector's auto-detected best guess. Used for
// the generic fallback config (bodySelector: null), and as a safety net if
// a listed site's selector stops matching after a redesign.
function findChapterBody(doc, config) {
  if (config.content.bodySelector) {
    const selected = doc.querySelector(config.content.bodySelector);
    if (selected) return selected;
    if (config.content.allowContentFallback === false) return null;
    const fallback = findLikelyContentElement(doc);
    if (fallback) log("  Note: configured selector didn't match - using auto-detected content instead.");
    return fallback;
  }
  return findLikelyContentElement(doc);
}

// True if the fetched chapter HTML looks like a paywalled/teaser version
// rather than the full content (per the site's `lockedTextMatch`), or if
// the chapter content container is missing entirely.
function looksLocked(html, config) {
  if (!config.content.lockedTextMatch) return false;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const body = doc.querySelector(config.content.bodySelector);
  if (!body) return true;
  return config.content.lockedTextMatch.test(body.textContent);
}

// Fetches a chapter page with hybrid fast/tab fetching: the fast path is
// tried first, and if the result looks locked and "Use browser tab for
// fetching" is enabled, it's retried via a real browser tab (using the
// user's logged-in session). Once that happens, `fetchState.forceTabFetch`
// is set so the rest of this run skips straight to tab-fetching, on the
// assumption that later chapters are gated too.
async function fetchChapterPage(url, config, fetchState) {
  if (config.requiresTabFetch) return fetchViaTab(url);
  if (!els.useTabFetch.checked) return fetchFast(url);
  const tabDelay = config.tabFetchDelay ?? 1000;
  if (fetchState.forceTabFetch) return fetchViaTab(url, tabDelay);

  let html;
  try {
    html = await fetchFast(url);
  } catch (err) {
    if (err.status === 429 || err.status === 503) bumpThrottle(fetchState, err.status);
    // A non-2xx response (e.g. a Cloudflare challenge page served as 403)
    // never reaches the locked-content check below - treat it the same way
    // and retry via a real browser tab.
    log(`  Normal fetch failed (${err.message}) - retrying with browser tab...`);
    const tabHtml = await fetchViaTab(url, tabDelay);
    fetchState.forceTabFetch = true;
    log("  Switching remaining chapters to browser-tab fetching.");
    return tabHtml;
  }

  if (!looksLocked(html, config)) {
    decayThrottle(fetchState);
    return html;
  }

  log("  This chapter looks locked via normal fetch - retrying with browser tab...");
  pageCache.delete(url); // The fallback must render the page, not reuse the locked response.
  const tabHtml = await fetchViaTab(url, tabDelay);
  fetchState.forceTabFetch = true;
  log("  Switching remaining chapters to browser-tab fetching.");
  return tabHtml;
}

function waitForTabLoad(tabId, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      browser.tabs.onUpdated.removeListener(listener);
      reject(new Error("Timed out waiting for page to load"));
    }, timeoutMs);

    function listener(updatedTabId, changeInfo, tab) {
      // Newly-created tabs briefly sit at "about:blank" before navigating to
      // the requested URL, and can fire a "complete" status for that blank
      // page first. Ignore that one so we don't run scripts against a tab
      // that's about to navigate out from under us.
      if (updatedTabId === tabId && changeInfo.status === "complete" && tab.url !== "about:blank") {
        clearTimeout(timeout);
        browser.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    browser.tabs.onUpdated.addListener(listener);
    // A cached page can finish loading before the listener is attached,
    // which would otherwise sit out the full timeout and fail the fetch.
    browser.tabs.get(tabId).then((tab) => {
      if (tab.status === "complete" && tab.url && tab.url !== "about:blank") listener(tabId, { status: "complete" }, tab);
    }).catch(() => {});
  });
}

async function loadCompletedGallery(url) {
  const html = await fetchViaTab(url, 1000, true);
  const doc = new DOMParser().parseFromString(html, "text/html");
  return new Set(parseDreamyGallery(doc, url, true).map(novel => novel.tocUrl));
}

async function fetchViaTab(url, delay = 1000, completedOnly = false) {
  const cacheKey = completedOnly ? `${url}#completed-only` : url;
  if (pageCache.has(cacheKey)) return pageCache.get(cacheKey);
  const tab = await browser.tabs.create({ url, active: false });
  try {
    await waitForTabLoad(tab.id);
    // Give client-rendered pages a brief moment to finish hydrating after
    // the initial "complete" status before reading the DOM.
    await sleep(delay);
    const results = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      args: [completedOnly],
      func: getConfigForUrl(url).id === "mistminthaven" ? readMistmintPage
        : getConfigForUrl(url).id === "dreamy-translations" ? readDreamyPage : () => document.documentElement.outerHTML,
    });
    if (results[0]?.error) throw new Error(results[0].error.message || String(results[0].error));
    const html = results[0]?.result ?? "";
    pageCache.set(cacheKey, html);
    return html;
  } finally {
    await browser.tabs.remove(tab.id).catch(() => {});
  }
}

// Attempts to silently fill in the WuxiaWorld API token from an open
// wuxiaworld.com tab's login session - the same mechanism as the manual
// "Get token from wuxiaworld.com" button, but run automatically when
// loading a wuxiaworld.com novel with no token saved yet. Failures are
// swallowed; the load just falls back to scraping instead of the API.
async function autoFillWuxiaToken() {
  try {
    const token = await readWuxiaTokenFromTab([]);
    if (!token) return "";
    els.wuxiaToken.value = token;
    await browser.storage.local.set({ wuxiaApiToken: token });
    return token;
  } catch {
    return "";
  }
}

els.loadBtn.addEventListener("click", async () => {
  if (operationRunning) return;
  const tocUrl = els.tocUrl.value.trim();
  const firstChapterUrl = els.firstChapterUrl.value.trim();
  if (!tocUrl && !firstChapterUrl) {
    showLoadError("Paste the novel's index URL first.");
    els.tocUrl.focus();
    return;
  }
  setBusy(true);
  cancelRequested = false;
  els.stopBtn.disabled = false;
  setTabStatus("Loading");
  try {
    await loadNovel(tocUrl, firstChapterUrl);
    if (els.autoCompile.checked && state.chapters.length > 0 && !cancelRequested) {
      await runCompile({ queued: true });
    } else {
      setTabStatus(state.chapters.length ? `${state.chapters.length} chapters` : "");
    }
  } catch (err) {
    log(`Load failed: ${err.message}`);
    showLoadError(err.message);
  } finally {
    setBusy(false);
    els.stopBtn.disabled = true;
  }
});

async function loadNovel(tocUrl, firstChapterUrl) {
  // Clear old data before validation or network work: failed jobs cannot reuse it.
  state = { config: null, novelTitle: "", author: "", coverUrl: null, chapters: [] };
  els.bookInfo.hidden = true;
  els.chapterSection.hidden = true;
  els.compileResult.hidden = true;
  clearLog();
  if (tocUrl) tocUrl = validateNovelUrl(tocUrl);
  if (firstChapterUrl) firstChapterUrl = validateNovelUrl(firstChapterUrl);
  const config = getConfigForUrl(firstChapterUrl || tocUrl);
  if (config.id === "mistminthaven") {
    const index = new URL(tocUrl || firstChapterUrl);
    if (!config.hostnamePattern.test(index.hostname)) throw new Error("The Mistmint Haven chapter and novel URLs must be on the same site.");
    const novelPath = index.pathname.match(/^\/novels\/[^/]+/);
    if (!novelPath) throw new Error("Use a Mistmint Haven novel URL under /novels/novel-name.");
    index.pathname = novelPath[0];
    index.search = "";
    index.hash = "";
    tocUrl = index.href;
    log("Mistmint Haven requires browser rendering. Loading its Free and Premium chapter lists in a background tab.");
  }
  if (config.id === "generic" && !firstChapterUrl) {
    throw new Error('This site needs a first chapter URL. Fill in the "First chapter URL" field for this novel, then retry.');
  }
  let wuxiaToken = els.wuxiaToken.value.trim();
  const novelSlug = tocUrl.match(/\/novel\/([^/?#]+)/)?.[1];
  if (config.id === "wuxiaworld" && !wuxiaToken && novelSlug) wuxiaToken = await autoFillWuxiaToken();
  if (cancelRequested) return;
  if (config.id === "wuxiaworld" && wuxiaToken && novelSlug) {
    await loadViaWuxiaApi(tocUrl, novelSlug, wuxiaToken, config);
  } else if (firstChapterUrl && !config.preferTocDiscovery) {
    await loadViaNextLinkWalk(tocUrl, firstChapterUrl, config);
  } else {
    if (config.toc.firstChapterSelector) {
      const html = await fetchPage(tocUrl);
      const doc = new DOMParser().parseFromString(html, "text/html");
      const first = Array.from(doc.querySelectorAll(config.toc.firstChapterSelector))
        .find((a) => config.toc.firstChapterTextMatch.test(a.textContent));
      if (!first?.getAttribute("href")) throw new Error('Could not find the first chapter. Fill in the "First chapter URL" field for this novel, then retry.');
      await loadViaNextLinkWalk(tocUrl, new URL(first.getAttribute("href"), tocUrl).href, config);
    } else {
      await loadToc(tocUrl, config);
    }
  }
  if (!cancelRequested && !state.chapters.length) {
    throw new Error("No accessible chapters found. Check the index URL and login, or provide a first chapter URL for next-link discovery.");
  }
  state.sourceUrl = tocUrl;
}

// Title, author, and cover from an index page, shared by every discovery path.
function readBookDetails(html, doc, url, config) {
  const titleEl = doc.querySelector(config.toc.titleSelector);
  let novelTitle = (titleEl ? titleEl.getAttribute(config.toc.titleAttr) || titleEl.textContent : "").trim();
  if (config.toc.titleSuffixRegex) novelTitle = novelTitle.replace(config.toc.titleSuffixRegex, "").trim();

  const coverSrc = doc.querySelector(config.toc.coverSelector)?.getAttribute(config.toc.coverAttr)?.trim();
  let coverUrl = null;
  try {
    if (coverSrc) coverUrl = new URL(coverSrc, url).href;
  } catch {
    // Malformed cover URL: compile without a cover rather than failing the load.
  }

  const author = config.toc.authorSourceRegex?.exec(html)?.[1]?.trim() || "Unknown";
  return { novelTitle: novelTitle || "Untitled", author, coverUrl };
}

// Best-effort metadata for API and next-link discovery: a failure is
// recorded as a warning instead of aborting the load.
async function tryReadBookDetails(tocUrl, config, discoveryIssues) {
  try {
    const html = await fetchPage(tocUrl);
    return readBookDetails(html, new DOMParser().parseFromString(html, "text/html"), tocUrl, config);
  } catch (err) {
    log(`Warning: could not load index URL for book details (${err.message}).`);
    discoveryIssues.push(`Could not load title, author, or cover details from ${tocUrl}: ${err.message}`);
    return { novelTitle: "Untitled", author: "Unknown", coverUrl: null };
  }
}

async function loadToc(url, config) {
  clearLog();

  const html = await fetchPage(url);
  const doc = new DOMParser().parseFromString(html, "text/html");
  const { novelTitle, author, coverUrl } = readBookDetails(html, doc, url, config);

  const linkEls = Array.from(doc.querySelectorAll(config.toc.linksSelector));
  const chapters = linkEls.map((a, i) => {
    let index = i + 1;
    if (a.dataset.chapterIndex) {
      index = Number(a.dataset.chapterIndex);
    } else if (config.toc.chapterIndexFromHrefRegex) {
      // Falls back to DOM order otherwise, which is wrong for TOCs that
      // list chapters newest-first - derive the real chapter number from
      // its URL instead.
      const m = config.toc.chapterIndexFromHrefRegex.exec(a.getAttribute("href"));
      if (m) index = Number(m[1]);
    }
    return {
      index,
      href: new URL(a.getAttribute("href"), url).href,
      label: a.textContent.trim() || `Chapter ${i + 1}`,
    };
  });
  chapters.sort((a, b) => a.index - b.index);

  state = { config, novelTitle, author, coverUrl, chapters };
  populateBookUi();
}

// Discovers chapters via the WuxiaWorld API instead of scraping pages: the
// API reflects exactly what the authenticated account can access (free and
// unlocked chapters), so this sees the same chapters the user's browser
// session does without relying on cookies. Book metadata (title/cover/
// author) is still read from the TOC page, same as `loadToc`.
async function loadViaWuxiaApi(tocUrl, novelSlug, token, config) {
  const discoveryIssues = [];
  const { novelTitle, author, coverUrl } = await tryReadBookDetails(tocUrl, config, discoveryIssues);

  clearLog();
  els.progressBar.removeAttribute("value");
  els.stopBtn.disabled = false;

  log("Fetching novel info from WuxiaWorld API...");
  const { novelId } = await WuxiaworldApi.getNovel(novelSlug, token);

  log("Fetching chapter list from WuxiaWorld API...");
  const allChapters = await WuxiaworldApi.getChapterList(novelId, token);
  const accessible = allChapters.filter((c) => c.accessible);
  accessible.sort((a, b) => a.chapterNumber - b.chapterNumber);

  const chapters = accessible.map((c) => ({
    index: c.chapterNumber,
    chapterId: c.chapterId,
    chapterSlug: c.chapterSlug,
    label: c.chapterName || `Chapter ${c.chapterNumber}`,
  }));

  els.progressBar.value = 0;
  els.stopBtn.disabled = true;
  log(`Found ${chapters.length} accessible chapter(s) out of ${allChapters.length} total.`);

  state = { config, novelTitle, author, coverUrl, chapters, novelSlug, apiToken: token, discoveryIssues };
  populateBookUi();
}

// Shared UI population for both discovery paths (TOC scrape and
// next-link-walk fallback) - reads from `state`.
function populateBookUi() {
  const { novelTitle, author, coverUrl, chapters } = state;

  els.bookTitle.textContent = novelTitle;
  els.bookAuthor.textContent = `by ${author}`;
  if (coverUrl) {
    els.coverPreview.alt = `Cover of ${novelTitle}`;
    els.coverPreview.src = coverUrl;
    els.coverPreview.hidden = false;
  } else {
    els.coverPreview.hidden = true;
  }
  els.bookInfo.hidden = false;

  els.chapterSearch.value = "";
  renderChapterList();
  els.chapterSection.hidden = false;
  els.rangeFrom.value = 1;
  // Chapter numbers can have gaps (e.g. WuxiaWorld API loads filter out
  // locked chapters but keep their original chapterNumber as `index`), so
  // the highest chapter number isn't always the same as the chapter count.
  els.rangeTo.value = chapters.length ? Math.max(...chapters.map((c) => c.index)) : 0;
  if (operationRunning) setBusy(true);
}

// Fallback chapter discovery for sites with a broken/missing TOC: starting
// from the first chapter URL, follow each page's "next chapter" link until
// none is found, a cycle is detected, or MAX_CHAPTERS is reached. The TOC
// URL (if provided) is used only for best-effort title/author/cover
// metadata - failures there don't abort discovery.
async function loadViaNextLinkWalk(tocUrl, firstChapterUrl, config) {
  const discoveryIssues = [];
  const { novelTitle, author, coverUrl } = tocUrl
    ? await tryReadBookDetails(tocUrl, config, discoveryIssues)
    : { novelTitle: "Untitled", author: "Unknown", coverUrl: null };

  clearLog();
  els.progressBar.removeAttribute("value"); // indeterminate while discovering
  els.stopBtn.disabled = false;

  if (config.id === "generic") {
    log(`This site isn't specifically supported - using best-effort auto-detection for content and "next chapter" links.`);
  }

  const chapters = [];
  const seen = new Set();
  const fetchState = { forceTabFetch: false, throttleMultiplier: 1 };
  let nextUrl = firstChapterUrl;
  let index = 1;

  while (nextUrl && !seen.has(nextUrl) && !cancelRequested && chapters.length < MAX_CHAPTERS) {
    seen.add(nextUrl);
    log(`Discovering chapter ${index}: ${nextUrl}`);
    updateNovelProgress(`Discovering chapters: ${chapters.length} found...`);

    let html;
    try {
      html = await fetchChapterPage(nextUrl, config, fetchState);
    } catch (err) {
      if (chapters.length === 0) throw err;
      log(`  Stopping discovery: ${err.message}`);
      discoveryIssues.push(`Chapter discovery stopped at ${nextUrl}: ${err.message}. Later chapters may be missing.`);
      nextUrl = null;
      break;
    }

    const doc = new DOMParser().parseFromString(html, "text/html");
    const label = extractChapterTitle(doc, novelTitle, config.siteName, config) || `Chapter ${index}`;
    chapters.push({ index, href: nextUrl, label });

    nextUrl = findNextChapterLink(doc, html, nextUrl, config, tocUrl);
    index += 1;

    if (nextUrl) {
      await sleep(politeDelay(config, fetchState));
    }
  }

  els.progressBar.value = 0;
  els.stopBtn.disabled = true;

  if (nextUrl && !cancelRequested && (seen.has(nextUrl) || chapters.length >= MAX_CHAPTERS)) {
    discoveryIssues.push(`Discovery stopped at a repeated chapter link or the ${MAX_CHAPTERS}-chapter limit. Later chapters may be missing: ${nextUrl}`);
  }
  if (cancelRequested) {
    log(`Stopped by user - discovered ${chapters.length} chapter(s) so far.`);
    discoveryIssues.push("Chapter discovery was stopped. Only chapters found before stopping are available.");
  } else {
    log(`Discovered ${chapters.length} chapter(s).`);
  }

  state = { config, novelTitle, author, coverUrl, chapters, discoveryIssues };
  populateBookUi();
}

// Finds the "next chapter" link on a chapter page and resolves it to an
// absolute URL. Returns null if no next chapter is found.
//
// Most sites expose this as a real `<a href>`, matched via the site config's
// nextLinkSelector/nextLinkTextMatch. Some client-rendered sites instead
// embed the next chapter's slug as JSON inside the page source (with no
// corresponding link element) - for those, nextLinkSourceRegex matches that
// slug directly out of the raw HTML, and nextLinkUrlPrefix is prepended to
// build the path before resolving.
function findNextChapterLink(doc, html, currentUrl, config, tocUrl) {
  // A "next chapter" link whose path is just the TOC/index page (sometimes
  // with an error query string tacked on) means the site ran out of
  // chapters and pointed back home - treat that as "no next chapter" so the
  // index page isn't appended as a bogus final chapter.
  const tocPath = tocUrl ? new URL(tocUrl).pathname : null;
  const isTocPage = (url) => tocPath !== null && new URL(url).pathname === tocPath;

  if (config.content.nextLinkSourceRegex) {
    const m = config.content.nextLinkSourceRegex.exec(html);
    if (!m) return null;
    const resolved = new URL((config.content.nextLinkUrlPrefix || "") + m[1], currentUrl).href;
    return isTocPage(resolved) ? null : resolved;
  }
  const candidates = doc.querySelectorAll(config.content.nextLinkSelector);
  for (const a of candidates) {
    if (config.content.nextLinkTextMatch.test(a.textContent)) {
      const href = a.getAttribute("href");
      if (href) {
        const resolved = new URL(href, currentUrl).href;
        if (isTocPage(resolved)) return null;
        return resolved;
      }
    }
  }
  return null;
}

function renderChapterList() {
  els.chapterList.innerHTML = "";
  const indexWidth = String(state.chapters.length).length;
  for (const chapter of state.chapters) {
    const li = document.createElement("li");
    li.className = "chapter-row";
    li.dataset.index = String(chapter.index);
    li.dataset.label = chapter.label.toLowerCase();

    const label = document.createElement("label");
    label.className = "chapter-row-label";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = true;
    checkbox.dataset.index = String(chapter.index);

    const indexEl = document.createElement("span");
    indexEl.className = "chapter-index";
    indexEl.textContent = String(chapter.index).padStart(indexWidth, "0");

    const titleEl = document.createElement("span");
    titleEl.className = "chapter-title";
    titleEl.textContent = chapter.label;

    const leaderEl = document.createElement("span");
    leaderEl.className = "chapter-leader";
    leaderEl.setAttribute("aria-hidden", "true");

    label.append(checkbox, indexEl, titleEl, leaderEl);
    li.appendChild(label);
    els.chapterList.appendChild(li);
  }
  lastToggledRow = null;
  filterChapterList();
}

els.chapterSearch.addEventListener("input", filterChapterList);

// Hides chapter rows that don't match the search query, by chapter name or
// number. An empty query shows every row.
function filterChapterList() {
  const query = els.chapterSearch.value.trim().toLowerCase();
  for (const li of els.chapterList.children) {
    li.hidden = query !== "" && !li.dataset.label.includes(query) && !li.dataset.index.includes(query);
  }
  // While searching, bulk selection only touches the matches on screen.
  els.selectAllBtn.textContent = query ? "Select shown" : "Select all";
  els.selectNoneBtn.textContent = query ? "Clear shown" : "Select none";
  updateSelectionCount();
}

function updateSelectionCount() {
  const boxes = Array.from(els.chapterList.querySelectorAll("input[type=checkbox]"));
  const selected = boxes.filter((cb) => cb.checked).length;
  els.selectionCount.textContent = boxes.length ? `${selected} of ${boxes.length} selected` : "";
  els.compileBtn.textContent = selected ? `Compile EPUB (${selected} chapter${selected === 1 ? "" : "s"})` : "Compile EPUB";
  els.compileBtn.disabled = operationRunning || selected === 0;
}

els.selectAllBtn.addEventListener("click", () => setAllChecked(true));
els.selectNoneBtn.addEventListener("click", () => setAllChecked(false));

function setAllChecked(value) {
  for (const li of els.chapterList.children) {
    if (!li.hidden) li.querySelector("input[type=checkbox]").checked = value;
  }
  updateSelectionCount();
}

// Shift-click selects every visible row between the last toggled row and this one.
let lastToggledRow = null;
els.chapterList.addEventListener("click", (event) => {
  const checkbox = event.target;
  if (checkbox?.type !== "checkbox") return;
  const row = checkbox.closest("li");
  const rows = Array.from(els.chapterList.children).filter((li) => !li.hidden);
  if (event.shiftKey && lastToggledRow && rows.includes(lastToggledRow)) {
    const [start, end] = [rows.indexOf(lastToggledRow), rows.indexOf(row)].sort((a, b) => a - b);
    for (const li of rows.slice(start, end + 1)) li.querySelector("input[type=checkbox]").checked = checkbox.checked;
  }
  lastToggledRow = row;
  updateSelectionCount();
});

els.applyRangeBtn.addEventListener("click", () => {
  const from = Number(els.rangeFrom.value);
  const to = Number(els.rangeTo.value);
  els.chapterList.querySelectorAll("input[type=checkbox]").forEach((cb) => {
    const idx = Number(cb.dataset.index);
    cb.checked = idx >= from && idx <= to;
  });
  updateSelectionCount();
});

els.compileBtn.addEventListener("click", runCompile);

async function runCompile({ queued = false } = {}) {
  if (operationRunning && !queued) return;
  setBusy(true);
  els.compileResult.hidden = true;
  clearLog();
  if (!queued) cancelRequested = false;
  els.stopBtn.disabled = false;
  const report = newCompileReport();
  lastDownloadId = null;
  try {
    await compile(report);
  } catch (err) {
    log(`Fatal error: ${err.message}`);
    report.issues.push(`EPUB could not be completed: ${err.message}`);
  } finally {
    showCompileResult(report);
    if (!queueRunning) setBusy(false);
    els.stopBtn.disabled = true;
  }
  return report;
}

function newCompileReport() {
  return { selected: 0, compiled: 0, images: 0, savedImages: 0, issues: [...(state.discoveryIssues || [])], stopped: false, downloaded: false };
}

function reportOutcome(report) {
  const incomplete = report.stopped || report.compiled < report.selected;
  return !report.downloaded ? "failed" : incomplete || report.issues.length ? "warning" : "success";
}

function reportCounts(report) {
  return `${report.compiled} of ${report.selected} selected chapters included. ${report.savedImages} of ${report.images} chapter images included.${report.filename ? ` File: ${report.filename}` : ""}`;
}

function showCompileResult(report) {
  const incomplete = report.stopped || report.compiled < report.selected;
  const outcome = reportOutcome(report);
  els.compileResult.dataset.outcome = outcome;
  els.compileResult.hidden = false;
  // The queue lists each novel's own file, so this only applies to single runs.
  els.showFileBtn.hidden = !report.downloaded || queueRunning || lastDownloadId === null;
  if (!queueRunning) setTabStatus({ success: "Done", warning: "Done with warnings", failed: "Failed" }[outcome]);
  els.resultTitle.textContent = !report.downloaded
    ? "EPUB not completed"
    : incomplete ? "Incomplete EPUB downloaded"
    : report.issues.length ? "EPUB downloaded with warnings"
    : "EPUB downloaded successfully. No errors detected.";
  els.resultCounts.textContent = reportCounts(report);
  els.resultIssues.replaceChildren();
  for (const issue of report.issues) {
    const li = document.createElement("li");
    li.textContent = issue;
    els.resultIssues.appendChild(li);
  }
  els.resultIssueCount.textContent = `${report.issues.length} issue(s). View details`;
  els.resultDetails.hidden = report.issues.length === 0;
  els.resultDetails.open = report.issues.length > 0;
  log(els.resultTitle.textContent);
  log(els.resultCounts.textContent);
}

async function compile(report) {
  const { config, novelTitle, author, coverUrl, chapters } = state;

  const selectedIndexes = new Set(
    Array.from(els.chapterList.querySelectorAll("input[type=checkbox]:checked")).map((cb) =>
      Number(cb.dataset.index)
    )
  );
  const selected = chapters.filter((c) => selectedIndexes.has(c.index));
  report.selected = selected.length;
  if (selected.length === 0) {
    log("No chapters selected.");
    report.issues.push("No chapters selected. Select at least one chapter and compile again.");
    return;
  }

  const outputTitle = state.outputTitle || novelTitle;
  const compiler = new EpubCompiler({ title: outputTitle, author, sourceUrl: state.sourceUrl || "" });
  const fetchState = { forceTabFetch: false, throttleMultiplier: 1 };

  if (coverUrl) {
    log("Fetching cover image...");
    try {
      const { blob, ext } = await fetchImage(coverUrl, fetchState);
      compiler.setCover(`cover.${ext}`, blob);
    } catch (err) {
      log(`Warning: could not fetch cover image (${err.message}).`);
      report.issues.push(`Cover image omitted: ${err.message}\n${coverUrl}`);
    }
  }

  const imageRegistry = new Map(); // absoluteUrl -> placeholder id
  const imageChapters = new Map(); // absoluteUrl -> chapter descriptions
  let currentChapter;
  let chapterImages;
  let imageCounter = 0;
  function registerImage(absoluteUrl) {
    chapterImages.add(absoluteUrl);
    if (!imageRegistry.has(absoluteUrl)) {
      imageCounter += 1;
      imageRegistry.set(absoluteUrl, `img${String(imageCounter).padStart(4, "0")}`);
    }
    return imageRegistry.get(absoluteUrl);
  }
  function reportImageError(reason) {
    report.issues.push(`Image omitted from ${currentChapter}: ${reason}`);
  }

  els.progressBar.max = selected.length;
  els.progressBar.value = 0;

  for (const [i, chapter] of selected.entries()) {
    if (cancelRequested) {
      log(`Stopped by user - compiling EPUB with ${compiler.chapters.length} chapter(s) fetched so far.`);
      report.issues.push(`Stopped before ${selected.length - i} selected chapter(s) could be processed, starting at chapter ${chapter.index}: ${chapter.label}.`);
      break;
    }

    log(`[${i + 1}/${selected.length}] Fetching ${chapter.label}`);
    updateNovelProgress(`Chapter ${i + 1} of ${selected.length}: ${chapter.label}`, i, selected.length);
    currentChapter = `Chapter ${chapter.index}: ${chapter.label}`;
    chapterImages = new Set();
    try {
      if (chapter.chapterId !== undefined) {
        // WuxiaWorld API-sourced chapter: the API returns just the chapter's
        // HTML fragment (no full page to query a body selector from).
        const chapterHtml = await WuxiaworldApi.getChapter(chapter.chapterId, state.apiToken);
        const doc = new DOMParser().parseFromString(`<div id="root">${chapterHtml}</div>`, "text/html");
        const body = doc.querySelector("#root");
        const baseUrl = `https://www.wuxiaworld.com/novel/${state.novelSlug}/${chapter.chapterSlug}`;
        const fragment = sanitizeChapterContent(body, doc, config, baseUrl, registerImage, reportImageError);
        if (!fragment.trim()) throw new Error("chapter content is empty");

        compiler.addChapter(chapter.label, fragment);
      } else {
        const html = await fetchChapterPage(chapter.href, config, fetchState);
        const doc = new DOMParser().parseFromString(html, "text/html");
        const body = findChapterBody(doc, config);
        if (!body) throw new Error("content container not found");

        const chapterTitle = extractChapterTitle(doc, novelTitle, config.siteName, config) || chapter.label;
        const fragments = [sanitizeChapterContent(body, doc, config, chapter.href, registerImage, reportImageError)];

        if (config.withinChapterPagination) {
          const { pageUrlSuffix } = config.withinChapterPagination;
          const baseUrl = chapter.href.split("/page/")[0];
          let prevSnippet = body.textContent.trim().slice(0, 80);

          for (let pageNum = 2; pageNum <= 50; pageNum++) {
            if (cancelRequested) {
              report.issues.push(`${currentChapter}: stopped before page ${pageNum}; chapter may be incomplete.`);
              break;
            }
            const pageUrl = baseUrl + pageUrlSuffix + pageNum;
            await sleep(politeDelay(config, fetchState));
            let pageHtml;
            try {
              pageHtml = await fetchChapterPage(pageUrl, config, fetchState);
            } catch (err) {
              // A missing page is the site's normal end-of-chapter signal.
              if (err.status !== 404) report.issues.push(`${currentChapter}: page ${pageNum} could not be fetched; chapter may be incomplete. ${err.message}\n${pageUrl}`);
              break;
            }
            const pageDoc = new DOMParser().parseFromString(pageHtml, "text/html");
            const pageBody = findChapterBody(pageDoc, config);
            if (!pageBody) break;
            const snippet = pageBody.textContent.trim().slice(0, 80);
            if (!snippet || snippet === prevSnippet) break; // empty or redirect loop
            log(`  Fetching page ${pageNum}`);
            fragments.push(sanitizeChapterContent(pageBody, pageDoc, config, pageUrl, registerImage, reportImageError));
            prevSnippet = snippet;
          }
        }

        const fragment = fragments.join("\n");
        if (!fragment.trim()) throw new Error("chapter content is empty");
        compiler.addChapter(chapterTitle, fragment);
      }
      // Only count images belonging to chapters actually included in the EPUB.
      for (const url of chapterImages) {
        if (!imageChapters.has(url)) imageChapters.set(url, new Set());
        imageChapters.get(url).add(currentChapter);
      }
    } catch (err) {
      log(`  Skipped: ${err.message}`);
      report.issues.push(`${currentChapter} omitted: ${err.message}${chapter.href ? `\n${chapter.href}` : ""}`);
    }

    els.progressBar.value = i + 1;
    const novelNumber = activeQueueJob ? ` · novel ${novelQueue.indexOf(activeQueueJob) + 1}/${novelQueue.length}` : "";
    setTabStatus(`${Math.round(((i + 1) / selected.length) * 100)}%${novelNumber}`);
    updateNovelProgress(`Processed ${i + 1} of ${selected.length} chapters`, i + 1, selected.length);

    if (i < selected.length - 1) {
      await sleep(politeDelay(config, fetchState));
    }
  }

  report.compiled = compiler.chapters.length;
  report.stopped = cancelRequested;
  if (compiler.chapters.length === 0) {
    log("No chapters were successfully compiled.");
    report.issues.push("No chapters were successfully compiled, so no EPUB was created.");
    return;
  }

  // Fetch every image discovered while sanitizing, then patch the
  // placeholder paths in each chapter to the real localized filenames.
  // Images that fail to fetch get their <img> tag stripped instead of
  // shipping a broken reference.
  const imageEntries = Array.from(imageRegistry.entries()).filter(([url]) => imageChapters.has(url));
  log(
    imageEntries.length > 0
      ? `Found ${imageEntries.length} image(s) to fetch.`
      : "No images found in the selected chapters."
  );
  report.images = imageEntries.length;
  const resolution = new Map(); // placeholder -> filename | null
  for (const [i, [absoluteUrl, placeholder]] of imageEntries.entries()) {
    if (cancelRequested) {
      log("Stopped by user - skipping remaining images.");
      break;
    }

    log(`Fetching image ${absoluteUrl}`);
    updateNovelProgress(`Image ${i + 1} of ${imageEntries.length}`, i, imageEntries.length);
    try {
      const { blob, ext } = await fetchImage(absoluteUrl, fetchState);
      const filename = `${placeholder}.${ext}`;
      compiler.addImage(filename, blob);
      report.savedImages += 1;
      resolution.set(placeholder, filename);
    } catch (err) {
      log(`  Warning: could not fetch image (${err.message}).`);
      report.issues.push(`Image omitted from ${Array.from(imageChapters.get(absoluteUrl)).join("; ")}: ${err.message}\n${absoluteUrl}`);
      resolution.set(placeholder, null);
    }
    if (i < imageEntries.length - 1) {
      await sleep(politeDelay(config, fetchState));
    }
  }

  // Any image never attempted (e.g. discovery was stopped early) gets its
  // <img> tag stripped, same as a failed fetch, instead of leaving a
  // dangling placeholder reference in the chapter XHTML.
  for (const [absoluteUrl, placeholder] of imageEntries) {
    if (!resolution.has(placeholder)) {
      resolution.set(placeholder, null);
      report.issues.push(`Image omitted from ${Array.from(imageChapters.get(absoluteUrl)).join("; ")}: stopped before download.\n${absoluteUrl}`);
    }
  }

  for (const chapter of compiler.chapters) {
    for (const [placeholder, filename] of resolution) {
      if (filename) {
        chapter.xhtmlFragment = chapter.xhtmlFragment.replaceAll(
          `../images/${placeholder}"`,
          `../images/${filename}"`
        );
      } else {
        chapter.xhtmlFragment = chapter.xhtmlFragment.replace(
          new RegExp(`<img[^>]*src="\\.\\./images/${placeholder}"[^>]*/>`, "g"),
          ""
        );
      }
    }
  }

  log("Building EPUB...");
  updateNovelProgress("Building EPUB...");
  report.stopped = cancelRequested;
  if (report.stopped && !report.issues.length) report.issues.push("Stop was requested. The EPUB contains the content processed before stopping.");
  els.stopBtn.disabled = !queueRunning;
  const blob = await compiler.generate();
  const objectUrl = URL.createObjectURL(blob);
  const filename = `${sanitizeFilename(outputTitle)}.epub`;

  try {
    log("Saving EPUB. Waiting for the browser to confirm the download...");
    updateNovelProgress("Saving EPUB. Waiting for the browser to confirm the download...");
    lastDownloadId = await downloadEpub(objectUrl, filename);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
  report.filename = filename;
  report.downloaded = true;
  if (cancelRequested && !report.stopped) report.issues.push("Stop was requested while saving this EPUB. The file finished downloading; no further queued novels will start.");
  report.stopped = cancelRequested;
  log(`Done: ${filename}`);
}

// A download ID only means the browser accepted the request, not that the file saved.
async function downloadEpub(url, filename) {
  let downloadId;
  let onChanged;
  const finished = new Promise((resolve, reject) => {
    const check = (item) => {
      const state = item.state?.current || item.state;
      if (state === "complete") resolve();
      if (state === "interrupted") reject(new Error(`Download interrupted: ${item.error?.current || item.error || "unknown reason"}`));
    };
    onChanged = (delta) => { if (delta.id === downloadId) check(delta); };
    browser.downloads.onChanged.addListener(onChanged);
    browser.downloads.download({ url, filename }).then(async (id) => {
      downloadId = id;
      // Covers a download that finishes before its ID is returned.
      const [item] = await browser.downloads.search({ id });
      if (!item) throw new Error("Download could not be found");
      check(item);
    }).catch(reject);
  });
  try {
    await finished;
  } finally {
    browser.downloads.onChanged.removeListener(onChanged);
  }
  return downloadId;
}
