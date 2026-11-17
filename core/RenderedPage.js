// Default page reader for browser-tab fetching. Runs inside the site's tab via
// browser.scripting.executeScript, so it must stay self-contained.
//
// Waits for the chapter text to render instead of trusting a fixed delay,
// reports bot-verification pages so the user can solve them, and flattens
// shadow roots: some reading sites render chapter text inside a (closed)
// shadow root as copy protection, which outerHTML never includes.
export async function readRenderedPage(bodySelector = null) {
  // Extension content scripts may read closed roots (Chrome: chrome.dom,
  // Firefox: openOrClosedShadowRoot); pages themselves cannot.
  const shadowOf = (el) => {
    try {
      return globalThis.chrome?.dom?.openOrClosedShadowRoot?.(el) ?? el.openOrClosedShadowRoot?.() ?? el.shadowRoot ?? null;
    } catch {
      return el.shadowRoot ?? null;
    }
  };
  const hosts = () => [...document.querySelectorAll("*")].filter((el) => shadowOf(el));
  // Lets the caller treat a rendered 429/503 page as a rate limit, not content.
  // responseStatus is newer than this extension's minimum browsers: null when absent.
  const status = performance.getEntriesByType?.("navigation")[0]?.responseStatus || null;

  const isChallenge = () => {
    const title = document.title.trim();
    if (/^(just a moment|attention required|checking your browser|verify(ing)? you are (a )?human|ddos-guard|security check)/i.test(title)) return true;
    if (document.querySelector("#challenge-form, #challenge-running, #cf-challenge-running, #challenge-stage")) return true;
    // CAPTCHA widgets also appear in ordinary comment and login forms, so only
    // count them when the page has almost no readable text.
    const captcha = document.querySelector('iframe[src*="challenges.cloudflare.com"], iframe[src*="hcaptcha.com"], iframe[src*="recaptcha"], .cf-turnstile');
    return !!captcha && (document.body?.innerText.trim().length ?? 0) < 1000;
  };

  const textOf = (root) => {
    let text = root.textContent || "";
    for (const host of root.querySelectorAll ? root.querySelectorAll("*") : []) {
      const shadow = shadowOf(host);
      if (shadow) text += shadow.textContent || "";
    }
    return text.trim();
  };

  const findBody = () => {
    if (!bodySelector) return null;
    const light = document.querySelector(bodySelector);
    if (light) return light;
    for (const host of hosts()) {
      const found = shadowOf(host).querySelector(bodySelector);
      if (found) return found;
    }
    return null;
  };

  // A configured body is ready once it has text or an image. Without one,
  // wait for the page text to stop growing across consecutive checks.
  const deadline = Date.now() + 15000;
  let lastLength = -1;
  let stable = 0;
  while (Date.now() < deadline) {
    if (isChallenge()) return { challenge: true, html: "", status };
    if (bodySelector) {
      const body = findBody();
      if (body && (textOf(body).length >= 50 || body.querySelector("img"))) break;
    } else {
      const length = document.body ? textOf(document.body).length : 0;
      stable = length >= 200 && length === lastLength ? stable + 1 : 0;
      lastLength = length;
      if (stable >= 2) break;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  // On timeout, return what rendered; the caller's checks report missing content.

  if (!hosts().length) return { challenge: false, html: document.documentElement.outerHTML, status };

  const RAW_TEXT = new Set(["script", "style", "xmp", "iframe", "noembed", "noframes", "noscript", "plaintext"]);
  const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
  const escapeText = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const escapeAttr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

  const serialize = (node, inShadow) => {
    if (node.nodeType === Node.TEXT_NODE) {
      return RAW_TEXT.has(node.parentNode?.localName) ? node.data : escapeText(node.data);
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const tag = node.localName;
    // Inside a shadow root, a <slot> shows the host's light children.
    if (tag === "slot" && inShadow) {
      const assigned = node.assignedNodes({ flatten: true });
      const nodes = assigned.length ? assigned : [...node.childNodes];
      return nodes.map((child) => serialize(child, false)).join("");
    }
    let attrs = "";
    for (const attr of node.attributes) attrs += ` ${attr.name}="${escapeAttr(attr.value)}"`;
    if (VOID.has(tag)) return `<${tag}${attrs}>`;
    const shadow = shadowOf(node);
    const children = shadow ? [...shadow.childNodes] : tag === "template" ? [] : [...node.childNodes];
    return `<${tag}${attrs}>${children.map((child) => serialize(child, inShadow || !!shadow)).join("")}</${tag}>`;
  };

  return { challenge: false, html: serialize(document.documentElement, false), status };
}
