// Serve the project and open tests/mistminthaven.html. No network requests.
import { readMistmintPage } from "../core/MistmintHaven.js";
import { getConfigForUrl } from "../core/ParserRegistry.js";
import { extractChapterTitle, sanitizeChapterContent } from "../core/ContentSanitizer.js";
import { EpubCompiler } from "../core/EpubCompiler.js";

function assert(condition, message) { if (!condition) throw new Error(message); }
const originalUrl = location.href;
const parse = html => new DOMParser().parseFromString(html, "text/html");
try {
  const config = getConfigForUrl("https://www.mistminthaven.com/novels/test");
  assert(config.id === "mistminthaven" && config.requiresTabFetch, "Dedicated rendered parser");
  assert(getConfigForUrl("https://mistminthaven.com.example.org/").id === "generic", "Exact host match");
  history.replaceState(null, "", "/novels/test");
  document.body.innerHTML = `<h1>Test Novel</h1><meta property="og:image" content="https://example.com/cover.png">
    <button role="tab" aria-selected="true" aria-controls="free">Free(3 Eps)</button>
    <button role="tab" aria-selected="false" aria-controls="premium">Premium(2 Eps)</button>
    <div role="tabpanel" id="free"></div><div role="tabpanel" id="premium"></div>`;
  const link = slug => `<a title="${slug}" href="/novels/test/${slug}">${slug}<span>Date</span></a>`;
  const free = link("volume-1-z-name-chapter-1") + link("volume-1-z-name-chapter-1") + link("volume-2-chapter-1");
  const premium = link("volume-1-a-name-chapter-2") + link("volume-10-chapter-1");
  document.getElementById("free").innerHTML = free;
  for (const tab of document.querySelectorAll('[role="tab"]')) {
    tab.addEventListener("click", () => {
      for (const other of document.querySelectorAll('[role="tab"]')) other.setAttribute("aria-selected", "false");
      tab.setAttribute("aria-selected", "true");
      document.getElementById("free").innerHTML = "";
      document.getElementById("premium").innerHTML = "";
      // Simulate delayed client rendering after switching tabs.
      setTimeout(() => { document.getElementById(tab.getAttribute("aria-controls")).innerHTML = tab.textContent.startsWith("Free") ? free : premium; }, 20);
    });
  }
  const toc = parse(await readMistmintPage());
  const chapters = [...toc.querySelectorAll(config.toc.linksSelector)];
  assert(chapters.map(a => a.title).join() === "volume-1-z-name-chapter-1,volume-1-a-name-chapter-2,volume-2-chapter-1,volume-10-chapter-1", "Deduplicate and merge free/premium by volume/chapter numbers, ignoring subtitle changes");
  assert(chapters.map(a => a.dataset.chapterIndex).join() === "1,2,3,4", "Unique selection indices");
  assert(!chapters.some(a => a.textContent.includes("Date")), "Clean chapter labels");
  assert(toc.querySelector(config.toc.coverSelector).getAttribute(config.toc.coverAttr).endsWith("cover.png"), "Cover metadata");

  history.replaceState(null, "", "/novels/test/chapter-1");
  document.body.innerHTML = `<h1>Chapter 1: Test</h1><div id="chapter-content-text"><p>Authored story.</p>
    <img src="/art.png"><img src="placeholder.gif" data-src="/lazy.png"><img></div><aside><img src="/avatar.png"></aside>`;
  const doc = parse(await readMistmintPage());
  const images = [], issues = [];
  const fragment = sanitizeChapterContent(doc.querySelector(config.content.bodySelector), doc, config,
    "https://www.mistminthaven.com/novels/test/chapter-1",
    url => { images.push(url); return `image${images.length}.png`; }, issue => issues.push(issue));
  assert(images.length === 2 && images[1].endsWith("/lazy.png"), "Inline/lazy images, no comment avatars");
  assert(issues.length === 1, "Missing image URL must warn");
  assert(extractChapterTitle(doc, "Test Novel", config.siteName, config) === "Chapter 1: Test", "Heading retains chapter number");
  const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7i0AAAAASUVORK5CYII="), c => c.charCodeAt(0));
  const blob = new Blob([png], { type: "image/png" });
  const compiler = new EpubCompiler({ title: "Test Novel", author: "Test Author" });
  compiler.setCover("cover.png", blob);
  compiler.addChapter("Chapter 1", fragment);
  images.forEach((_, i) => compiler.addImage(`image${i + 1}.png`, blob));
  const zip = await JSZip.loadAsync(await (await compiler.generate()).arrayBuffer());
  const xhtml = await zip.file("OEBPS/text/chapter0001.xhtml").async("string");
  for (let i = 1; i <= images.length; i++) {
    const bytes = await zip.file(`OEBPS/images/image${i}.png`).async("uint8array");
    assert(bytes.length === png.length && bytes.every((byte, index) => byte === png[index]), "EPUB image bytes");
    assert(xhtml.includes(`../images/image${i}.png`), "EPUB image references");
  }
  assert(zip.file("OEBPS/images/cover.png"), "EPUB cover");

  document.body.innerHTML = '<h1>Chapter 496</h1><h2>This is a premium chapter</h2><p>Please log in to access this chapter</p>';
  let locked = false;
  try { await readMistmintPage(); } catch (err) { locked = /Premium chapter is locked/.test(err.message); }
  assert(locked, "Locked chapter must fail explicitly, never become book content");

  document.body.innerHTML = '<h2>Content Warning</h2><button>Yes, I am over 18</button>';
  let gated = false;
  try { await readMistmintPage(); } catch (err) { gated = /content\/age confirmation/.test(err.message); }
  assert(gated, "Content confirmation must require the user's interaction on the site");

  document.body.innerHTML = '<h1>Loading chapter</h1>';
  const originalNow = Date.now;
  let clock = 0, timedOut = false;
  Date.now = () => { clock += 31000; return clock; };
  try { await readMistmintPage(); } catch (err) { timedOut = /30 seconds/.test(err.message); }
  finally { Date.now = originalNow; }
  assert(timedOut, "Incomplete rendering must time out, not report success");

  history.replaceState(null, "", "/novels/test");
  document.body.innerHTML = '<button role="tab" aria-selected="true" aria-controls="empty">Free(0 Eps)</button><div id="empty"></div>';
  assert(!parse(await readMistmintPage()).querySelector(config.toc.linksSelector), "Empty list must finish without timing out");
  document.body.innerHTML = '<pre id="result"></pre>';
  document.getElementById("result").textContent = "PASS: Mistmint rendered tabs, duplicates, numeric volume order, chapter titles, image packaging, locked chapters, content gates, timeouts, and empty lists.";
} catch (err) {
  document.body.innerHTML = '<pre id="result"></pre>';
  document.getElementById("result").textContent = `FAIL: ${err.message}`;
  throw err;
} finally {
  history.replaceState(null, "", originalUrl);
}
