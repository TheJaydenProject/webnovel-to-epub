// Adaptive per-site request pacing (additive-increase/multiplicative-decrease).
//
// A site's real limit can only be found by exceeding it, and some sites ban
// on the first breach without a 429 warning, so this never probes past a
// conservative floor: it starts at the site's configured polite delay,
// speeds up slowly after long clean streaks, and backs off hard on any sign
// of trouble. Learned delays persist per site and drift back to the default.

export const SPEEDUP_STREAK = 8;      // clean responses before each speed-up
export const SPEEDUP_FACTOR = 0.9;
export const MIN_COOLDOWN_MS = 30_000;
export const MAX_COOLDOWN_MS = 10 * 60_000;
export const MAX_DELAY_MS = 30_000;
const LEARNED_TTL_MS = 7 * 24 * 60 * 60_000;

export class SiteRateLimiter {
  constructor({ baseDelay = 1000, jitter = 0, learned = null, now = Date.now() } = {}) {
    this.baseDelay = baseDelay;
    this.jitter = jitter;
    // Never faster than half the site's polite default, and never under 500ms.
    this.minDelay = Math.max(500, baseDelay * 0.5);
    this.delay = Math.max(baseDelay, this.minDelay);
    this.streak = 0;
    this.strikes = 0;
    // A first-visit bot check says nothing about our speed; a block after
    // the site has been answering normally does.
    this.successes = 0;
    this.speedupLocked = false;
    // Older lessons fade: a site that throttled us last month may have
    // relaxed, and one we sped up on may have tightened.
    if (learned && Number.isFinite(learned.delay) && now - learned.updatedAt < LEARNED_TTL_MS) {
      this.delay = clamp(learned.delay, this.minDelay, MAX_DELAY_MS);
    }
  }

  // Wait before the next request, with jitter so requests are not metronomic.
  nextDelay(random = Math.random) {
    return Math.round(this.delay + random() * this.jitter);
  }

  onSuccess() {
    this.successes += 1;
    this.streak += 1;
    if (this.speedupLocked || this.streak < SPEEDUP_STREAK) return false;
    this.streak = 0;
    const next = Math.max(this.minDelay, this.delay * SPEEDUP_FACTOR);
    const changed = next !== this.delay;
    this.delay = next;
    return changed;
  }

  // 429/503: slow down and pause. Returns the cooldown in ms, or null when
  // the site asks for a pause too long to wait out safely.
  onThrottle(retryAfterMs = null) {
    this.streak = 0;
    this.strikes += 1;
    this.delay = Math.min(MAX_DELAY_MS, this.delay * 2);
    if (retryAfterMs !== null && retryAfterMs > MAX_COOLDOWN_MS) return null;
    const escalating = MIN_COOLDOWN_MS * 2 ** (this.strikes - 1);
    return Math.min(MAX_COOLDOWN_MS, Math.max(retryAfterMs ?? 0, escalating));
  }

  // Bot checks or a sudden 403: back off further and stop speeding up.
  onBlocked() {
    this.streak = 0;
    this.speedupLocked = true;
    this.delay = Math.min(MAX_DELAY_MS, this.delay * 3);
  }

  snapshot(now = Date.now()) {
    return { delay: Math.round(this.delay), updatedAt: now };
  }
}

// Retry-After is either delay-seconds or an HTTP date (RFC 9110 10.2.3).
export function parseRetryAfter(value, now = Date.now()) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const date = Date.parse(trimmed);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
