// Runs inside the site's browser tab. Keep this function self-contained for
// browser.scripting.executeScript: read rendered pages, not private app state.
export async function readMistmintPage() {
  const waitFor = async (read) => {
    const deadline = Date.now() + 30000;
    do {
      if ([...document.querySelectorAll("h2")].some(el => el.textContent.trim() === "Content Warning")) {
        throw new Error("This novel requires a content/age confirmation. Open its page in your browser and complete the site's prompt before retrying.");
      }
      const value = read();
      if (value) return value;
      await new Promise(resolve => setTimeout(resolve, 200));
    } while (Date.now() < deadline);
    throw new Error("Mistmint Haven did not finish loading within 30 seconds. Check the page and retry.");
  };
  const isIndex = /^\/novels\/[^/]+\/?$/.test(location.pathname);
  if (!isIndex) {
    await waitFor(() => {
      const locked = [...document.querySelectorAll("h2")].some(el => /This is a premium chapter/i.test(el.textContent));
      if (locked) throw new Error("Premium chapter is locked. Log in to Mistmint Haven with access to this chapter, then retry.");
      const body = document.querySelector("#chapter-content-text");
      return body && (body.textContent.trim() || body.querySelector("img"));
    });
    return document.documentElement.outerHTML;
  }

  await waitFor(() => document.querySelector('[role="tab"][aria-selected="true"]'));
  const chapters = new Map();
  for (const tab of document.querySelectorAll('[role="tab"]')) {
    if (!/^(Free|Premium)\s*\(/i.test(tab.textContent)) continue;
    tab.click();
    const expected = Number(tab.textContent.match(/\(([\d,]+)\s*Eps\)/i)?.[1]?.replaceAll(",", ""));
    if (!Number.isFinite(expected)) throw new Error("Could not read Mistmint Haven's chapter count.");
    const links = await waitFor(() => {
      if (tab.getAttribute("aria-selected") !== "true") return null;
      const panel = document.getElementById(tab.getAttribute("aria-controls"));
      const found = [...(panel?.querySelectorAll("a[href][title]") || [])];
      return found.length === expected ? found : null;
    });
    for (const link of links) {
      const url = new URL(link.getAttribute("href"), location.href);
      if (url.origin !== location.origin || !url.pathname.startsWith(location.pathname.replace(/\/$/, "") + "/")) {
        throw new Error("Mistmint Haven's chapter list contains an unexpected URL.");
      }
      if (!chapters.has(url.href)) chapters.set(url.href, link.cloneNode(true));
    }
  }
  const links = [...chapters.values()];
  // ponytail: numbered chapter/volume slugs can be sorted across
  // Free/Premium tabs. Unnumbered slugs retain the site's order; a future
  // different URL scheme needs explicit ordering support.
  if (links.every(a => /chapter-\d/i.test(a.getAttribute("href")))) {
    const collator = new Intl.Collator("en", { numeric: true });
    const order = a => {
      const slug = new URL(a.getAttribute("href"), location.href).pathname.split("/").filter(Boolean).pop();
      return [Number(slug.match(/volume-(\d+)/i)?.[1] || 0), slug.match(/chapter-(\d+(?:[.-]\d+)*)/i)?.[1] || "0"];
    };
    links.sort((a, b) => {
      const left = order(a), right = order(b);
      return left[0] - right[0] || collator.compare(left[1], right[1]);
    });
  }
  const output = document.documentElement.cloneNode(true);
  const list = document.createElement("div");
  links.forEach((link, i) => {
    link.dataset.chapterIndex = String(i + 1);
    link.setAttribute("data-epub-chapter", "");
    link.textContent = link.getAttribute("title");
    list.appendChild(link);
  });
  output.querySelector("body").appendChild(list);
  return output.outerHTML;
}
