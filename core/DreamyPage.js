// Self-contained function executed in a temporary browser tab.
export async function readDreamyPage(completedOnly = false) {
  const path = location.pathname;
  const isGallery = /^\/series\/?$/.test(path);
  const isNovel = /^\/novel\/[^/]+\/?$/.test(path);
  const deadline = Date.now() + 30000;
  let clicked = false, lastCards = null, stable = 0;
  while (Date.now() < deadline) {
    let ready = false;
    if (isGallery) {
      ready = !!document.querySelector('a[href*="/novel/"] h3');
      if (completedOnly) {
        const button = [...document.querySelectorAll("button")].find(el => el.textContent.trim() === "Completed");
        const selected = button?.style.backgroundColor === "rgb(245, 158, 11)";
        if (ready && button && !selected && !clicked) {
          button.click();
          clicked = true;
        }
        const cards = [...document.querySelectorAll('a[href*="/novel/"]')].filter(a => a.querySelector("h3")).map(a => a.getAttribute("href")).join("\n");
        stable = selected && cards === lastCards ? stable + 1 : 0;
        lastCards = cards;
        if (selected && stable >= 3) return document.documentElement.outerHTML.replace(/<html\b/i, '<html data-epub-completed-filter="verified"');
        ready = false;
      }
    } else if (isNovel) {
      const free = [...document.querySelectorAll("button")].map(el => /^\s*Free\s*\(([\d,]+)\)\s*$/i.exec(el.textContent)).find(Boolean);
      ready = !!document.querySelector("h1") && !!free && document.querySelectorAll("a[data-chapter-index]").length === Number(free[1].replaceAll(",", ""));
    } else {
      const body = document.querySelector("article.chapter-content");
      ready = !!body && (!!body.textContent.trim() || !!body.querySelector("img"));
    }
    if (ready) return document.documentElement.outerHTML;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(completedOnly ? "Could not verify Dreamy's Completed filter within 30 seconds. No unverified novels will be downloaded."
    : "Dreamy page did not expose its content within 30 seconds. Check that it loads and that you have access, then retry.");
}
