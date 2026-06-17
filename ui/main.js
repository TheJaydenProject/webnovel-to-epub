import { getConfigForUrl } from "../core/ParserRegistry.js";
import { extractChapterTitle, sanitizeChapterContent } from "../core/ContentSanitizer.js";
import { EpubCompiler } from "../core/EpubCompiler.js";
import * as WuxiaworldApi from "../core/WuxiaworldApi.js";

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
};

const EXT_FOR_MIME = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

let state = {
  config: null,
  novelTitle: "",
  author: "",
  coverUrl: null,
  chapters: [],
};

// Safety cap for "next chapter" link-walking discovery, in case of a
// misconfigured selector that never terminates. Cycle detection (the
// `seen` set) and the Stop button are the main safeguards - this is just
// a last resort so it's effectively never hit for real novels.
const MAX_CHAPTERS = 10000;

// Set by the Stop button; checked between steps of the discovery walk and
// the compile loop so either can be cut short while keeping whatever was
// found/compiled so far.
let cancelRequested = false;

els.stopBtn.addEventListener("click", () => {
  cancelRequested = true;
  els.stopBtn.disabled = true;
  log("Stop requested - finishing up with what's been found so far...");
});

const params = new URLSearchParams(location.search);
if (params.get("url")) els.tocUrl.value = params.get("url");

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

function log(message) {
  els.log.textContent += message + "\n";
  els.log.scrollTop = els.log.scrollHeight;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function politeDelay(config) {
  const base = config.fetchIntervalBase ?? 1000;
  const jitter = config.fetchJitterRange ?? 0;
  return base + Math.random() * jitter;
}

function sanitizeFilename(name) {
  return name.replace(/[\\/:*?"<>|]+/g, "_").trim() || "book";
}

async function fetchImage(url) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const mime = res.headers.get("content-type")?.split(";")[0];
  const ext = EXT_FOR_MIME[mime] || "jpg";
  return { blob, ext };
}

async function fetchFast(url) {
  const res = await fetch(url, { credentials: "include", cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// Fetches a page's HTML. Normally a plain `fetch` is used, but extension
// `fetch` requests are cross-site, so sites that gate content behind a
// `SameSite=Lax/Strict` login cookie won't see the user as logged in. When
// "Use browser tab for fetching" is checked, the page is instead loaded in
// a real background tab (a same-site navigation, so the user's normal
// session cookies apply) and its rendered HTML is read back out.
async function fetchPage(url) {
  if (els.useTabFetch.checked) return fetchViaTab(url);
  return fetchFast(url);
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
  if (!els.useTabFetch.checked) return fetchFast(url);
  const tabDelay = config.tabFetchDelay ?? 1000;
  if (fetchState.forceTabFetch) return fetchViaTab(url, tabDelay);

  let html;
  try {
    html = await fetchFast(url);
  } catch (err) {
    // A non-2xx response (e.g. a Cloudflare challenge page served as 403)
    // never reaches the locked-content check below - treat it the same way
    // and retry via a real browser tab.
    log(`  Normal fetch failed (${err.message}) - retrying with browser tab...`);
    const tabHtml = await fetchViaTab(url, tabDelay);
    fetchState.forceTabFetch = true;
    log("  Switching remaining chapters to browser-tab fetching.");
    return tabHtml;
  }

  if (!looksLocked(html, config)) return html;

  log("  This chapter looks locked via normal fetch - retrying with browser tab...");
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
  });
}

async function fetchViaTab(url, delay = 1000) {
  const tab = await browser.tabs.create({ url, active: false });
  try {
    await waitForTabLoad(tab.id);
    // Give client-rendered pages a brief moment to finish hydrating after
    // the initial "complete" status before reading the DOM.
    await sleep(delay);
    const results = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.documentElement.outerHTML,
    });
    return results[0]?.result ?? "";
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
  const tocUrl = els.tocUrl.value.trim();
  const firstChapterUrl = els.firstChapterUrl.value.trim();
  if (!tocUrl && !firstChapterUrl) return;
  const config = getConfigForUrl(firstChapterUrl || tocUrl);
  if (!config) {
    els.log.textContent = "";
    log("This site is not supported yet. Check that the URL is correct, or open an issue to request support for it.");
    return;
  }
  els.loadBtn.disabled = true;
  try {
    let wuxiaToken = els.wuxiaToken.value.trim();
    const novelSlug = tocUrl.match(/\/novel\/([^/?#]+)/)?.[1];
    if (config.id === "wuxiaworld" && !wuxiaToken && novelSlug) {
      wuxiaToken = await autoFillWuxiaToken();
    }
    if (config.id === "wuxiaworld" && wuxiaToken && novelSlug) {
      await loadViaWuxiaApi(tocUrl, novelSlug, wuxiaToken, config);
    } else if (firstChapterUrl && !config.preferTocDiscovery) {
      await loadViaNextLinkWalk(tocUrl, firstChapterUrl, config);
    } else {
      await loadToc(tocUrl, config);
    }
    if (els.autoCompile.checked && state.chapters.length > 0 && !cancelRequested) {
      await runCompile();
    }
  } catch (err) {
    log(`Load failed: ${err.message}`);
  } finally {
    els.loadBtn.disabled = false;
  }
});

async function loadToc(url, config) {
  els.log.textContent = "";
  cancelRequested = false;

  const html = await fetchPage(url);
  const doc = new DOMParser().parseFromString(html, "text/html");

  const titleEl = doc.querySelector(config.toc.titleSelector);
  let novelTitle = (
    titleEl ? titleEl.getAttribute(config.toc.titleAttr) || titleEl.textContent : "Untitled"
  ).trim();
  if (config.toc.titleSuffixRegex) {
    novelTitle = novelTitle.replace(config.toc.titleSuffixRegex, "").trim();
  }

  const coverEl = doc.querySelector(config.toc.coverSelector);
  const coverUrl = coverEl
    ? new URL(coverEl.getAttribute(config.toc.coverAttr), url).href
    : null;

  let author = "Unknown";
  if (config.toc.authorSourceRegex) {
    const m = config.toc.authorSourceRegex.exec(html);
    if (m) author = m[1];
  }

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
  let novelTitle = "Untitled";
  let author = "Unknown";
  let coverUrl = null;

  try {
    const html = await fetchPage(tocUrl);
    const doc = new DOMParser().parseFromString(html, "text/html");

    const titleEl = doc.querySelector(config.toc.titleSelector);
    if (titleEl) {
      novelTitle = (titleEl.getAttribute(config.toc.titleAttr) || titleEl.textContent).trim();
      if (config.toc.titleSuffixRegex) {
        novelTitle = novelTitle.replace(config.toc.titleSuffixRegex, "").trim();
      }
    }

    const coverEl = doc.querySelector(config.toc.coverSelector);
    if (coverEl) {
      coverUrl = new URL(coverEl.getAttribute(config.toc.coverAttr), tocUrl).href;
    }

    if (config.toc.authorSourceRegex) {
      const m = config.toc.authorSourceRegex.exec(html);
      if (m) author = m[1];
    }
  } catch (err) {
    log(`Warning: could not load index URL for book details (${err.message}).`);
  }

  els.log.textContent = "";
  els.progressBar.removeAttribute("value");
  cancelRequested = false;
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

  state = { config, novelTitle, author, coverUrl, chapters, novelSlug, apiToken: token };
  populateBookUi();
}

// Shared UI population for both discovery paths (TOC scrape and
// next-link-walk fallback) - reads from `state`.
function populateBookUi() {
  const { novelTitle, author, coverUrl, chapters } = state;

  els.bookTitle.textContent = novelTitle;
  els.bookAuthor.textContent = `by ${author}`;
  if (coverUrl) {
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
  els.rangeTo.value = chapters.length;
}

// Fallback chapter discovery for sites with a broken/missing TOC: starting
// from the first chapter URL, follow each page's "next chapter" link until
// none is found, a cycle is detected, or MAX_CHAPTERS is reached. The TOC
// URL (if provided) is used only for best-effort title/author/cover
// metadata - failures there don't abort discovery.
async function loadViaNextLinkWalk(tocUrl, firstChapterUrl, config) {
  let novelTitle = "Untitled";
  let author = "Unknown";
  let coverUrl = null;

  if (tocUrl) {
    try {
      const html = await fetchPage(tocUrl);
      const doc = new DOMParser().parseFromString(html, "text/html");

      const titleEl = doc.querySelector(config.toc.titleSelector);
      if (titleEl) {
        novelTitle = (
          titleEl.getAttribute(config.toc.titleAttr) || titleEl.textContent
        ).trim();
        if (config.toc.titleSuffixRegex) {
          novelTitle = novelTitle.replace(config.toc.titleSuffixRegex, "").trim();
        }
      }

      const coverEl = doc.querySelector(config.toc.coverSelector);
      if (coverEl) {
        coverUrl = new URL(coverEl.getAttribute(config.toc.coverAttr), tocUrl).href;
      }

      if (config.toc.authorSourceRegex) {
        const m = config.toc.authorSourceRegex.exec(html);
        if (m) author = m[1];
      }
    } catch (err) {
      log(`Warning: could not load index URL for book details (${err.message}).`);
    }
  }

  els.log.textContent = "";
  els.progressBar.removeAttribute("value"); // indeterminate while discovering
  cancelRequested = false;
  els.stopBtn.disabled = false;

  const chapters = [];
  const seen = new Set();
  const fetchState = { forceTabFetch: false };
  let nextUrl = firstChapterUrl;
  let index = 1;

  while (nextUrl && !seen.has(nextUrl) && !cancelRequested && chapters.length < MAX_CHAPTERS) {
    seen.add(nextUrl);
    log(`Discovering chapter ${index}: ${nextUrl}`);

    let html;
    try {
      html = await fetchChapterPage(nextUrl, config, fetchState);
    } catch (err) {
      if (chapters.length === 0) throw err;
      log(`  Stopping discovery: ${err.message}`);
      break;
    }

    const doc = new DOMParser().parseFromString(html, "text/html");
    const label = extractChapterTitle(doc, novelTitle, config.siteName, config) || `Chapter ${index}`;
    chapters.push({ index, href: nextUrl, label });

    nextUrl = findNextChapterLink(doc, html, nextUrl, config, tocUrl);
    index += 1;

    if (nextUrl) {
      await sleep(politeDelay(config));
    }
  }

  els.progressBar.value = 0;
  els.stopBtn.disabled = true;

  if (cancelRequested) {
    log(`Stopped by user - discovered ${chapters.length} chapter(s) so far.`);
  } else {
    log(`Discovered ${chapters.length} chapter(s).`);
  }

  state = { config, novelTitle, author, coverUrl, chapters };
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
}

els.selectAllBtn.addEventListener("click", () => setAllChecked(true));
els.selectNoneBtn.addEventListener("click", () => setAllChecked(false));

function setAllChecked(value) {
  els.chapterList.querySelectorAll("input[type=checkbox]").forEach((cb) => (cb.checked = value));
}

els.applyRangeBtn.addEventListener("click", () => {
  const from = Number(els.rangeFrom.value);
  const to = Number(els.rangeTo.value);
  els.chapterList.querySelectorAll("input[type=checkbox]").forEach((cb) => {
    const idx = Number(cb.dataset.index);
    cb.checked = idx >= from && idx <= to;
  });
});

els.compileBtn.addEventListener("click", runCompile);

async function runCompile() {
  els.compileBtn.disabled = true;
  els.log.textContent = "";
  cancelRequested = false;
  els.stopBtn.disabled = false;
  try {
    await compile();
  } catch (err) {
    log(`Fatal error: ${err.message}`);
  } finally {
    els.compileBtn.disabled = false;
    els.stopBtn.disabled = true;
  }
}

async function compile() {
  const { config, novelTitle, author, coverUrl, chapters } = state;

  const selectedIndexes = new Set(
    Array.from(els.chapterList.querySelectorAll("input[type=checkbox]:checked")).map((cb) =>
      Number(cb.dataset.index)
    )
  );
  const selected = chapters.filter((c) => selectedIndexes.has(c.index));
  if (selected.length === 0) {
    log("No chapters selected.");
    return;
  }

  const compiler = new EpubCompiler({ title: novelTitle, author });

  if (coverUrl) {
    log("Fetching cover image...");
    try {
      const { blob, ext } = await fetchImage(coverUrl);
      compiler.setCover(`cover.${ext}`, blob);
    } catch (err) {
      log(`Warning: could not fetch cover image (${err.message}).`);
    }
  }

  const imageRegistry = new Map(); // absoluteUrl -> placeholder id
  let imageCounter = 0;
  function registerImage(absoluteUrl) {
    if (!imageRegistry.has(absoluteUrl)) {
      imageCounter += 1;
      imageRegistry.set(absoluteUrl, `img${String(imageCounter).padStart(4, "0")}`);
    }
    return imageRegistry.get(absoluteUrl);
  }

  els.progressBar.max = selected.length;
  els.progressBar.value = 0;

  const fetchState = { forceTabFetch: false };

  for (const [i, chapter] of selected.entries()) {
    if (cancelRequested) {
      log(`Stopped by user - compiling EPUB with ${compiler.chapters.length} chapter(s) fetched so far.`);
      break;
    }

    log(`[${i + 1}/${selected.length}] Fetching ${chapter.label}`);
    try {
      if (chapter.chapterId !== undefined) {
        // WuxiaWorld API-sourced chapter: the API returns just the chapter's
        // HTML fragment (no full page to query a body selector from).
        const chapterHtml = await WuxiaworldApi.getChapter(chapter.chapterId, state.apiToken);
        const doc = new DOMParser().parseFromString(`<div id="root">${chapterHtml}</div>`, "text/html");
        const body = doc.querySelector("#root");
        const baseUrl = `https://www.wuxiaworld.com/novel/${state.novelSlug}/${chapter.chapterSlug}`;
        const fragment = sanitizeChapterContent(body, doc, config, baseUrl, registerImage);
        if (!fragment.trim()) throw new Error("chapter content is empty");

        compiler.addChapter(chapter.label, fragment);
      } else {
        const html = await fetchChapterPage(chapter.href, config, fetchState);
        const doc = new DOMParser().parseFromString(html, "text/html");
        const body = doc.querySelector(config.content.bodySelector);
        if (!body) throw new Error("content container not found");

        const chapterTitle = extractChapterTitle(doc, novelTitle, config.siteName, config) || chapter.label;
        const fragments = [sanitizeChapterContent(body, doc, config, chapter.href, registerImage)];

        if (config.withinChapterPagination) {
          const { pageUrlSuffix } = config.withinChapterPagination;
          const baseUrl = chapter.href.split("/page/")[0];
          let prevSnippet = body.textContent.trim().slice(0, 80);

          for (let pageNum = 2; pageNum <= 50; pageNum++) {
            const pageUrl = baseUrl + pageUrlSuffix + pageNum;
            await sleep(politeDelay(config));
            let pageHtml;
            try {
              pageHtml = await fetchChapterPage(pageUrl, config, fetchState);
            } catch {
              break; // 404 or network error — no more pages
            }
            const pageDoc = new DOMParser().parseFromString(pageHtml, "text/html");
            const pageBody = pageDoc.querySelector(config.content.bodySelector);
            if (!pageBody) break;
            const snippet = pageBody.textContent.trim().slice(0, 80);
            if (!snippet || snippet === prevSnippet) break; // empty or redirect loop
            log(`  Fetching page ${pageNum}`);
            fragments.push(sanitizeChapterContent(pageBody, pageDoc, config, pageUrl, registerImage));
            prevSnippet = snippet;
          }
        }

        const fragment = fragments.join("\n");
        if (!fragment.trim()) throw new Error("chapter content is empty");
        compiler.addChapter(chapterTitle, fragment);
      }
    } catch (err) {
      log(`  Skipped: ${err.message}`);
    }

    els.progressBar.value = i + 1;

    if (i < selected.length - 1) {
      await sleep(politeDelay(config));
    }
  }

  if (compiler.chapters.length === 0) {
    log("No chapters were successfully compiled.");
    return;
  }

  // Fetch every image discovered while sanitizing, then patch the
  // placeholder paths in each chapter to the real localized filenames.
  // Images that fail to fetch get their <img> tag stripped instead of
  // shipping a broken reference.
  const resolution = new Map(); // placeholder -> filename | null
  for (const [absoluteUrl, placeholder] of imageRegistry) {
    if (cancelRequested) {
      log("Stopped by user - skipping remaining images.");
      break;
    }

    log(`Fetching image ${absoluteUrl}`);
    try {
      const { blob, ext } = await fetchImage(absoluteUrl);
      const filename = `${placeholder}.${ext}`;
      compiler.addImage(filename, blob);
      resolution.set(placeholder, filename);
    } catch (err) {
      log(`  Warning: could not fetch image (${err.message}).`);
      resolution.set(placeholder, null);
    }
    await sleep(politeDelay(config));
  }

  // Any image never attempted (e.g. discovery was stopped early) gets its
  // <img> tag stripped, same as a failed fetch, instead of leaving a
  // dangling placeholder reference in the chapter XHTML.
  for (const placeholder of imageRegistry.values()) {
    if (!resolution.has(placeholder)) resolution.set(placeholder, null);
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
  const blob = await compiler.generate();
  const objectUrl = URL.createObjectURL(blob);
  const filename = `${sanitizeFilename(novelTitle)}.epub`;

  await browser.downloads.download({ url: objectUrl, filename });
  log(`Done: ${filename}`);
}
