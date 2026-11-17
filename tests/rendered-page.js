// Serve the project and open tests/rendered-page.html. No remote requests.
import { readRenderedPage } from "../core/RenderedPage.js";
const result = document.getElementById("result");
const fixture = document.getElementById("fixture");
let checks = 0;
function assert(condition, message) { if (!condition) throw new Error(message); checks++; }
const parse = (html) => new DOMParser().parseFromString(html, "text/html");
const story = "The rain had not stopped for three days, and the river was rising. ".repeat(4);

try {
  // Text inside a shadow root, including a slotted light child, survives serialization.
  const host = document.createElement("div");
  host.id = "viewer-1";
  host.innerHTML = "<p>Slotted translator note.</p>";
  host.attachShadow({ mode: "open" }).innerHTML = `<p>${story}</p><slot></slot>`;
  fixture.replaceChildren(host);
  let page = await readRenderedPage('div[id^="viewer"]');
  assert(!page.challenge, "Ordinary page is not a challenge");
  let doc = parse(page.html);
  assert(doc.querySelector("#viewer-1 p")?.textContent.includes("rain had not stopped"), "Shadow text is serialized into the host");
  assert(doc.querySelector("#viewer-1").textContent.includes("Slotted translator note."), "Slotted light children are kept");
  assert(doc.querySelector("#result"), "Light DOM outside the host is kept");

  // Without shadow roots the page is returned exactly as outerHTML.
  fixture.replaceChildren(Object.assign(document.createElement("p"), { textContent: story }));
  page = await readRenderedPage(null);
  assert(page.html === document.documentElement.outerHTML, "Plain pages are returned unchanged");

  // Content that renders late is waited for instead of read empty.
  const late = document.createElement("div");
  late.className = "chapter-body";
  fixture.replaceChildren(late);
  setTimeout(() => { late.innerHTML = `<p>${story}</p>`; }, 600);
  page = await readRenderedPage(".chapter-body");
  assert(parse(page.html).querySelector(".chapter-body p"), "Late-rendered chapter text is captured");

  // Verification pages are reported, not returned as content.
  const title = document.title;
  document.title = "Just a moment...";
  page = await readRenderedPage(null);
  document.title = title;
  assert(page.challenge === true, "Cloudflare interstitial title is detected");

  fixture.replaceChildren();
  result.textContent = `PASS: ${checks} rendered page checks`;
} catch (err) {
  result.textContent = `FAIL after ${checks} checks: ${err.message}`;
}
