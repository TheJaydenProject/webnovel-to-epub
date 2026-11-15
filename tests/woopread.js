// Serve the project locally and open tests/woopread.html in a browser.
// Native DOM parsing and the real EPUB compiler, with authored fixture text.
import { getConfigForUrl } from "../core/ParserRegistry.js";
import { sanitizeChapterContent, extractChapterTitle } from "../core/ContentSanitizer.js";
import { EpubCompiler } from "../core/EpubCompiler.js";

function assert(condition, message) { if (!condition) throw new Error(message); }
try {
  const base = "https://woopread.com/series/prince-rage/chapter-0-prologue";
  const config = getConfigForUrl(base);
  assert(config.id === "woopread", "WoopRead must use its dedicated parser");
  assert(getConfigForUrl("https://woopread.com.example.org/").id === "generic", "Host match must be exact");
  const toc = new DOMParser().parseFromString(`<meta property="og:title" content="Prince Rage">
    <meta property="og:image" content="https://imgcdn.woopread.com/cover.webp">
    <span>Author<!-- -->:</span> <a href="#">Test Author</a>
    <a href="/series/prince-rage/chapter-0-prologue"> Read Now </a>
    <div id="chapter-list-container"><a href="/series/prince-rage/chapter-40">Chapter 40</a></div>`, "text/html");
  const first = [...toc.querySelectorAll(config.toc.firstChapterSelector)].find((a) => config.toc.firstChapterTextMatch.test(a.textContent));
  assert(first.getAttribute("href").endsWith("chapter-0-prologue"), "Discovery must begin at Read Now, not the latest chapter");
  assert(config.toc.authorSourceRegex.exec(toc.documentElement.outerHTML)?.[1] === "Test Author", "Author extraction");
  assert(toc.querySelector(config.toc.coverSelector).getAttribute(config.toc.coverAttr).endsWith("cover.webp"), "Cover extraction");
  const doc = new DOMParser().parseFromString(`<title>Chapter 0: Prologue - Prince Rage</title>
    <div id="chapter-fixture"><p>Authored chapter text.<button>Play from paragraph 1</button></p>
    <img src="/illustration.png" alt="Illustration">
    <img src="data:image/gif;base64,placeholder" data-src="https://imgcdn.woopread.com/lazy.png">
    <img data-lazy-src="/lazy-two.png"><img srcset="/responsive.png 800w, /large.png 1600w">
    <img src="data:image/gif;base64,placeholder" data-srcset="/lazy-responsive.png 800w"><img></div>
    <a href="/series/prince-rage/chapter-1"><button>Next</button></a>
    <aside><img src="/comment-avatar.png"></aside>`, "text/html");
  const urls = [];
  const issues = [];
  const body = doc.querySelector(config.content.bodySelector);
  const fragment = sanitizeChapterContent(body, doc, config, base, (url) => {
    urls.push(url);
    return `image${urls.length}.png`;
  }, (issue) => issues.push(issue));
  assert(urls.length === 5, "All five usable chapter images must be registered");
  assert(urls[1] === "https://imgcdn.woopread.com/lazy.png", "Lazy source must override placeholder");
  assert(urls[4] === "https://woopread.com/lazy-responsive.png", "Lazy srcset must override placeholder");
  assert(!urls.some((url) => url.includes("comment-avatar")), "Comment images must be excluded");
  assert(issues.length === 1 && issues[0].includes("without a source"), "Missing source must produce a warning");
  assert(!fragment.includes("Play from paragraph"), "Reader controls must be removed");
  assert(extractChapterTitle(doc, "Prince Rage", config.siteName, config) === "Chapter 0: Prologue", "Chapter title cleanup");
  assert([...doc.querySelectorAll(config.content.nextLinkSelector)].some((a) => config.content.nextLinkTextMatch.test(a.textContent)), "Next chapter link must match");

  const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7i0AAAAASUVORK5CYII="), (c) => c.charCodeAt(0));
  const blob = new Blob([png], { type: "image/png" });
  const compiler = new EpubCompiler({ title: "Prince Rage", author: "Test Author" });
  compiler.setCover("cover.png", blob);
  compiler.addChapter("Chapter 0: Prologue", fragment);
  urls.forEach((url, i) => compiler.addImage(`image${i + 1}.png`, blob));
  const zip = await JSZip.loadAsync(await (await compiler.generate()).arrayBuffer());
  const xhtml = await zip.file("OEBPS/text/chapter0001.xhtml").async("string");
  const opf = await zip.file("OEBPS/content.opf").async("string");
  assert(!new DOMParser().parseFromString(xhtml, "application/xml").querySelector("parsererror"), "Chapter XHTML must be valid XML");
  for (let i = 1; i <= urls.length; i++) {
    const bytes = await zip.file(`OEBPS/images/image${i}.png`).async("uint8array");
    assert(bytes.length === png.length && bytes.every((byte, index) => byte === png[index]), "Image bytes must survive EPUB compression");
    assert(xhtml.includes(`../images/image${i}.png`) && opf.includes(`images/image${i}.png`), "Image references and manifest entries must exist");
  }
  assert(zip.file("OEBPS/images/cover.png") && opf.includes('properties="cover-image"'), "Cover must be packaged");
  document.getElementById("result").textContent = "PASS: WoopRead metadata, first/next links, chapter text, five inline image variants, missing-image warning, and EPUB image bytes/references/cover.";
} catch (err) {
  document.getElementById("result").textContent = `FAIL: ${err.message}`;
  throw err;
}
