import { validateNovelUrl } from "./QueueInput.js";

export function validateGalleryUrl(value) {
  const url = new URL(validateNovelUrl(value));
  if (!/^(www\.)?dreamy-translations\.com$/.test(url.hostname) || !/^\/series\/?$/.test(url.pathname) || url.search) {
    throw new Error("Gallery scraping currently supports https://dreamy-translations.com/series. Use the unfiltered series URL.");
  }
  return "https://dreamy-translations.com/series";
}

export function canonicalDreamyNovelUrl(value) {
  try {
    const url = new URL(validateNovelUrl(value));
    if (!/^(www\.)?dreamy-translations\.com$/.test(url.hostname)) return null;
    const path = url.pathname.match(/^\/novel\/([^/]+)\/?$/);
    return path ? `https://dreamy-translations.com/novel/${path[1]}` : null;
  } catch { return null; }
}

export function normalizeBookTitle(title) {
  return title.normalize("NFKC").toLowerCase().replace(/\(\s*hiatus\s*\)/gi, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export function parseDreamyGallery(doc, baseUrl, completedOnly = false) {
  if (completedOnly && doc.documentElement.getAttribute("data-epub-completed-filter") !== "verified") {
    throw new Error("Dreamy's Completed filter could not be verified.");
  }
  const novels = new Map();
  for (const card of doc.querySelectorAll('a[href*="/novel/"]')) {
    const title = card.querySelector("h3")?.textContent.trim();
    if (!title) continue;
    const tocUrl = canonicalDreamyNovelUrl(new URL(card.getAttribute("href"), baseUrl).href);
    if (!tocUrl) throw new Error("The gallery contains an unexpected novel URL. No downloads were started.");
    novels.set(tocUrl, { tocUrl, title });
  }
  if (!novels.size && !completedOnly) throw new Error("No gallery novels found. The page may not have loaded or its layout has changed.");
  return [...novels.values()];
}

export function parseDreamyNovel(doc, baseUrl) {
  const title = doc.querySelector("h1")?.textContent.trim();
  if (!title) throw new Error("Novel title was not found.");
  const count = name => {
    const values = [...doc.querySelectorAll("button")].map(el =>
      new RegExp(`^\\s*${name}\\s*\\(([\\d,]+)\\)\\s*$`, "i").exec(el.textContent))
      .filter(Boolean).map(m => Number(m[1].replaceAll(",", "")));
    return values.length && values.every(n => Number.isSafeInteger(n) && n === values[0]) ? values[0] : null;
  };
  const chapters = [...doc.querySelectorAll("a[data-chapter-index][href]")]
    .map(a => ({ index: Number(a.dataset.chapterIndex), href: new URL(a.getAttribute("href"), baseUrl).href }))
    .sort((a, b) => a.index - b.index);
  const novel = canonicalDreamyNovelUrl(baseUrl);
  if (!novel || chapters.some(c => !Number.isFinite(c.index) || !c.href.startsWith(novel + "/chapter/"))) {
    throw new Error("The novel contains an unexpected chapter URL.");
  }
  return { title, free: count("Free"), premium: count("Premium"), firstChapterUrl: chapters[0]?.href || "", chapterCount: chapters.length };
}

export function gallerySkipReason(novel, library, queuedUrls, options) {
  const matched = library.sources.get(novel.tocUrl) || library.titles.get(normalizeBookTitle(novel.title));
  if (matched) return { status: "existing", reason: `Already in folder: ${matched}` };
  if (queuedUrls.has(novel.tocUrl)) return { status: "queued", reason: "Already in the queue" };
  if (options.skipHiatus && /\(\s*hiatus\s*\)/i.test(novel.title)) return { status: "hiatus", reason: "Skipped: (Hiatus) in title" };
  if (options.onlyCompleted && novel.completed !== true) return { status: "notCompleted", reason: "Skipped: not listed in Dreamy's Completed gallery" };
  if (options.onlyFree && novel.premium !== 0) return {
    status: novel.premium == null ? "unknown" : "premium",
    reason: novel.premium == null ? "Skipped: could not verify the premium count" : `Skipped: ${novel.premium} premium chapters`,
  };
  return null;
}

// Read only bounded metadata, never chapter/image entries. A damaged EPUB
// still participates by filename, with an explicit warning for the user.
async function readMetadataEntry(entry) {
  if (!entry) throw new Error("EPUB metadata is missing");
  return new Promise((resolve, reject) => {
    let text = "";
    const stream = entry.internalStream("string");
    stream.on("data", chunk => {
      if (text.length + chunk.length > 2 * 1024 * 1024) {
        stream.pause();
        reject(new Error("EPUB metadata exceeds the 2 MB limit"));
      } else text += chunk;
    }).on("error", reject).on("end", () => resolve(text)).resume();
  });
}

function parseXml(text) {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error("Unsupported XML declarations in EPUB metadata");
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("Invalid EPUB metadata XML");
  return doc;
}

export async function scanEpubLibrary(files, { onProgress = () => {}, cancelled = () => false } = {}) {
  const library = { titles: new Map(), sources: new Map(), count: 0, warnings: [] };
  const epubs = Array.from(files).filter(file => /\.epub$/i.test(file.name));
  for (const [i, file] of epubs.entries()) {
    if (cancelled()) break;
    const name = file.webkitRelativePath || file.name;
    onProgress(i + 1, epubs.length, name);
    const filenameTitle = normalizeBookTitle(file.name.replace(/\.epub$/i, "").replace(/\s*\(\d+\)$/, ""));
    if (filenameTitle) library.titles.set(filenameTitle, name);
    library.count++;
    try {
      if (file.size > 256 * 1024 * 1024) throw new Error("File exceeds the 256 MB metadata-scan limit");
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      const container = parseXml(await readMetadataEntry(zip.file("META-INF/container.xml")));
      const path = container.getElementsByTagNameNS("*", "rootfile")[0]?.getAttribute("full-path");
      if (!path || path.startsWith("/") || path.split("/").includes("..")) throw new Error("Invalid EPUB package path");
      const opf = parseXml(await readMetadataEntry(zip.file(path)));
      const dc = "http://purl.org/dc/elements/1.1/";
      const titles = [...opf.getElementsByTagNameNS(dc, "title")].map(el => normalizeBookTitle(el.textContent)).filter(Boolean);
      if (!titles.length) throw new Error("EPUB title metadata is missing");
      for (const title of titles) library.titles.set(title, name);
      for (const el of opf.getElementsByTagNameNS(dc, "source")) {
        const source = canonicalDreamyNovelUrl(el.textContent.trim());
        if (source) library.sources.set(source, name);
      }
    } catch (err) {
      library.warnings.push(`${name}: matching by filename only (${err.message}).`);
    }
  }
  return library;
}
