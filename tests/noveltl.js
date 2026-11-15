// Serve the project locally and open tests/noveltl.html in a browser.
import { getConfigForUrl } from "../core/ParserRegistry.js";
import { sanitizeChapterContent, extractChapterTitle } from "../core/ContentSanitizer.js";
import { EpubCompiler } from "../core/EpubCompiler.js";

function assert(condition, message) { if (!condition) throw new Error(message); }
try {
  const base = "https://noveltl.com/chapter-1-cause-of-death/";
  const config = getConfigForUrl(base);
  assert(config.id === "noveltl", "Dedicated parser required");
  assert(getConfigForUrl("https://noveltl.com.example.org/").id === "generic", "Exact host match required");
  const parse = (html) => new DOMParser().parseFromString(html, "text/html");
  const toc = parse(`<h1 class="entry-title">Test Novel</h1><img class="ts-post-image" src="/cover.png">
    <span class="sername">Author</span><span class="serval"><a>Test Author</a></span>
    <div class="eplisterfull"><ul>
    <li><a href="/test-novel-chapter-220/">Ch. 220</a></li>
    <li><a href="/chapter-2-cause-of-death/">Ch. 2</a></li>
    <li><a href="/chapter-1-cause-of-death/">Ch. 1</a></li></ul></div>
    <aside><a href="/unrelated-chapter-5/">Unrelated</a></aside>`);
  const numbers = [...toc.querySelectorAll(config.toc.linksSelector)].map(a => Number(config.toc.chapterIndexFromHrefRegex.exec(a.getAttribute("href"))[1])).sort((a, b) => a - b);
  assert(numbers.join() === "1,2,220", "Newest-first list must become reading order and exclude sidebar");
  assert(toc.querySelector(config.toc.titleSelector).textContent === "Test Novel", "Novel title");
  assert(toc.querySelector(config.toc.coverSelector).getAttribute(config.toc.coverAttr) === "/cover.png", "Cover");
  assert(config.toc.authorSourceRegex.exec(toc.documentElement.outerHTML)[1] === "Test Author", "Author");
  const doc = parse(`<title>Chapter 1 – Cause of Death – Novel Translations</title>
    <div class="epcontent entry-content"><p>Authored test chapter.</p><img src="/art.png">
    <img src="placeholder.gif" data-src="/lazy.png"><img><script>advertisement</script></div>
    <a rel="next" href="/chapter-2-cause-of-death/">Next <i></i></a>
    <aside><img src="/avatar.png"></aside>`);
  const images = [], issues = [];
  const fragment = sanitizeChapterContent(doc.querySelector(config.content.bodySelector), doc, config, base,
    url => { images.push(url); return `image${images.length}.png`; }, issue => issues.push(issue));
  assert(images.join() === "https://noveltl.com/art.png,https://noveltl.com/lazy.png", "Story images only, including lazy source");
  assert(issues.length === 1, "Missing source must warn");
  assert(config.content.allowContentFallback === false, "Missing body must not capture comments");
  assert(config.content.nextLinkTextMatch.test(doc.querySelector(config.content.nextLinkSelector).textContent), "Next chapter navigation");
  assert(extractChapterTitle(doc, "Test Novel", config.siteName, config) === "Chapter 1 – Cause of Death", "Clean chapter title");
  const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7i0AAAAASUVORK5CYII="), c => c.charCodeAt(0));
  const blob = new Blob([png], { type: "image/png" });
  const compiler = new EpubCompiler({ title: "Test Novel", author: "Test Author" });
  compiler.setCover("cover.png", blob);
  compiler.addChapter("Chapter 1", fragment);
  images.forEach((_, i) => compiler.addImage(`image${i + 1}.png`, blob));
  const zip = await JSZip.loadAsync(await (await compiler.generate()).arrayBuffer());
  const xhtml = await zip.file("OEBPS/text/chapter0001.xhtml").async("string");
  const opf = await zip.file("OEBPS/content.opf").async("string");
  for (let i = 1; i <= images.length; i++) {
    const bytes = await zip.file(`OEBPS/images/image${i}.png`).async("uint8array");
    assert(bytes.length === png.length && bytes.every((byte, index) => byte === png[index]), "EPUB image bytes");
    assert(xhtml.includes(`../images/image${i}.png`) && opf.includes(`images/image${i}.png`), "EPUB image references");
  }
  assert(zip.file("OEBPS/images/cover.png") && opf.includes('properties="cover-image"'), "EPUB cover");
  document.getElementById("result").textContent = "PASS: NovelTL metadata, reading order, navigation, inline/lazy images, missing-image warning, and EPUB image packaging.";
} catch (err) {
  document.getElementById("result").textContent = `FAIL: ${err.message}`;
  throw err;
}
