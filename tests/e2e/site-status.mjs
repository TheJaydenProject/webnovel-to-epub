// Decides whether a live site is reachable before the extension is tested
// against it, so a failure can be blamed on the site or on the extension.

// One plain request with no browser disguise. Cloudflare may answer it with
// 403, which still proves the site is up; only errors and 5xx mean down.
export async function probe(url, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(url, { redirect: "follow", signal: AbortSignal.timeout(20000) });
    return { status: res.status };
  } catch (err) {
    return { error: err.cause?.code || err.name || "network error" };
  }
}

// home: the site's front page; page: the sample novel's index page.
// Returns { verdict: "up" | "down" | "gone", reason }.
export function classifyProbe(home, page) {
  const describe = (result) => result.error ? result.error : `HTTP ${result.status}`;
  if (home.error || home.status >= 500) return { verdict: "down", reason: `site down (${describe(home)})` };
  if (page.error || page.status >= 500) return { verdict: "down", reason: `novel page unavailable (${describe(page)}), homepage up` };
  if (page.status === 404 || page.status === 410) return { verdict: "gone", reason: `sample novel removed (${describe(page)}); choose a new sample URL` };
  return { verdict: "up", reason: describe(page) };
}

// Results that mean the extension (or its sample data) needs fixing.
export const OUR_FAULT = new Set(["fail", "warn", "gone"]);
