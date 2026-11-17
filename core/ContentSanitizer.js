// Pure DOM transformation utilities: turn a raw chapter document into a
// minimal XHTML fragment plus a list of image references to localize.
// No network access happens here - callers handle fetching.

// Attributes are always stripped, so these only add structure. <hr> carries
// scene breaks, and blockquote/lists/sub/sup carry letters, system windows,
// and translator notes that otherwise collapse into run-on text.
const ALLOWED_TAGS = new Set([
  "p", "h1", "h2", "h3", "h4", "h5", "h6",
  "b", "i", "em", "strong", "u", "s", "sub", "sup",
  "blockquote", "ul", "ol", "li",
]);

// Lowercases and strips everything but letters/digits, so text-blacklist
// patterns still match obfuscated boilerplate (stray punctuation, spacing).
function normalizeForMatch(text) {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Derives "Chapter N: Subtitle" from a page <title> like
// "{Novel Title} - Chapter N: Subtitle - {Site Name}".
export function extractChapterTitle(doc, novelTitle, siteName, config) {
  if (config?.content?.chapterTitleSelector) {
    const heading = doc.querySelector(config.content.chapterTitleSelector)?.textContent.trim();
    if (heading) return heading;
  }
  const raw = (doc.querySelector("title")?.textContent || "").trim();

  // Some sites repeat the novel and chapter titles twice in the <title> tag
  // (e.g. "{Novel} #{Chapter} - Read {Novel} {Chapter} Online - All Page -
  // {Site}"), which the generic prefix/suffix stripping below can't untangle.
  // chapterTitleSourceRegex extracts just the chapter title directly.
  if (config?.content?.chapterTitleSourceRegex) {
    const m = config.content.chapterTitleSourceRegex.exec(raw);
    if (m) return m[1].trim();
  }

  let title = raw;
  if (siteName && title.endsWith(siteName)) {
    title = title.slice(0, title.length - siteName.length);
  }
  title = title.replace(/[-–—/|\s]+$/, "");
  if (novelTitle && title.startsWith(novelTitle)) {
    title = title.slice(novelTitle.length);
    title = title.replace(/^[-–—/|\s]+/, "");
  } else if (novelTitle && title.endsWith(novelTitle)) {
    // Some sites put the novel title after the chapter title, e.g.
    // "Chapter 1: Subtitle - {Novel Title} | {Site Name}".
    title = title.slice(0, title.length - novelTitle.length);
    title = title.replace(/[-–—/|\s]+$/, "");
  }
  return title || raw;
}

// Removes blacklisted elements, strips everything down to a small set of
// allowed tags/attributes, and rewrites <img> sources to local paths via
// registerImage(absoluteUrl) -> localFilename. Returns an XHTML fragment
// string (no wrapping root element).
export function sanitizeChapterContent(bodyElement, doc, config, baseUrl, registerImage, reportImageError = () => {}) {
  for (const selector of config.elementBlacklist || []) {
    bodyElement.querySelectorAll(selector).forEach((el) => el.remove());
  }

  if (config.stripCssHiddenElements) {
    removeCssHiddenElements(bodyElement, doc);
  }

  // Removes paragraphs that are entirely site-injected boilerplate (e.g.
  // "read this on our site" watermarks), matched against text with case and
  // punctuation/spacing stripped so obfuscated variants (e.g. styled
  // characters or stray parentheses) still match.
  for (const pattern of config.textBlacklist || []) {
    bodyElement.querySelectorAll("p").forEach((p) => {
      if (pattern.test(normalizeForMatch(p.textContent))) p.remove();
    });
  }

  const container = doc.createElement("div");
  for (const child of Array.from(bodyElement.childNodes)) {
    for (const cleaned of cleanNode(child, doc, baseUrl, registerImage, reportImageError)) {
      container.appendChild(cleaned);
    }
  }

  const serialized = new XMLSerializer().serializeToString(container);
  return serialized.replace(/^<div[^>]*>/, "").replace(/<\/div>$/, "");
}

// Some sites inject "stolen content" trap paragraphs hidden via an inline
// <style> rule with a randomized per-request class name (display:none,
// visibility:hidden, or font-size:0), which a static elementBlacklist
// selector can't target. Find those rules and remove matching elements.
function removeCssHiddenElements(bodyElement, doc) {
  const hidingRule = /display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0\b/i;
  doc.querySelectorAll("style").forEach((style) => {
    const re = /([^{}]+)\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(style.textContent || ""))) {
      if (!hidingRule.test(m[2])) continue;
      for (const selector of m[1].split(",")) {
        try {
          bodyElement.querySelectorAll(selector.trim()).forEach((el) => el.remove());
        } catch {
          // Invalid/unsupported selector - skip.
        }
      }
    }
  });

  // Some sites hide elements (e.g. a cover image or boilerplate blurb) via an
  // inline style="display:none" attribute directly on the element, rather
  // than a <style> block rule.
  bodyElement.querySelectorAll("[style]").forEach((el) => {
    if (hidingRule.test(el.getAttribute("style") || "")) el.remove();
  });
}

function cleanNode(node, doc, baseUrl, registerImage, reportImageError) {
  if (node.nodeType === Node.TEXT_NODE) {
    return [doc.createTextNode(node.textContent)];
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return [];
  }

  const tag = node.tagName.toLowerCase();

  if (tag === "img") {
    // Lazy loaders can leave a transparent placeholder in src until scrolled.
    const lazySrcset = node.getAttribute("data-srcset")?.split(",")[0]?.trim().split(/\s+/)[0];
    let src = ["data-src", "data-lazy-src", "data-original"]
      .map((attr) => node.getAttribute(attr)?.trim()).find(Boolean) || lazySrcset || node.getAttribute("src")?.trim();
    if (!src) {
      // Responsive images with only `srcset` (no plain `src`) would
      // otherwise be dropped entirely - fall back to the first candidate's
      // URL (stripping its trailing width/density descriptor, e.g. "800w").
      const srcset = node.getAttribute("data-srcset") || node.getAttribute("srcset");
      src = srcset?.split(",")[0]?.trim().split(/\s+/)[0];
    }
    if (!src) {
      reportImageError("The page contains an image without a source URL.");
      return [];
    }
    let absoluteUrl;
    try {
      absoluteUrl = new URL(src, baseUrl).href;
    } catch {
      reportImageError("The page contains an invalid image URL.");
      return [];
    }
    const localFilename = registerImage(absoluteUrl);
    const img = doc.createElement("img");
    img.setAttribute("src", `../images/${localFilename}`);
    const alt = node.getAttribute("alt");
    if (alt) img.setAttribute("alt", alt);
    return [img];
  }

  if (tag === "br" || tag === "hr") {
    return [doc.createElement(tag)];
  }

  const children = Array.from(node.childNodes).flatMap((child) =>
    cleanNode(child, doc, baseUrl, registerImage, reportImageError)
  );

  if (ALLOWED_TAGS.has(tag)) {
    const el = doc.createElement(tag);
    children.forEach((c) => el.appendChild(c));
    return [el];
  }

  // Disallowed wrapper element: drop the tag but keep its sanitized children.
  return children;
}
