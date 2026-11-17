// Run with: node tests/rate-limiter.mjs
import assert from "node:assert/strict";
import { SiteRateLimiter, parseRetryAfter, SPEEDUP_STREAK, MIN_COOLDOWN_MS, MAX_COOLDOWN_MS, MAX_DELAY_MS } from "../core/RateLimiter.js";

const fresh = () => new SiteRateLimiter({ baseDelay: 1000, jitter: 600 });

// Starts at the polite default; jitter only adds.
let limiter = fresh();
assert.equal(limiter.nextDelay(() => 0), 1000);
assert.equal(limiter.nextDelay(() => 0.5), 1300);

// Speeds up only after a full clean streak, and never past the floor.
for (let i = 1; i < SPEEDUP_STREAK; i++) assert.equal(limiter.onSuccess(), false);
assert.equal(limiter.onSuccess(), true);
assert.equal(limiter.delay, 900);
for (let i = 0; i < SPEEDUP_STREAK * 50; i++) limiter.onSuccess();
assert.equal(limiter.delay, 500, "floor is half the polite default");
assert.equal(new SiteRateLimiter({ baseDelay: 600 }).minDelay, 500, "absolute floor of 500ms");
assert.equal(new SiteRateLimiter({ baseDelay: 0 }).delay, 500, "never starts below the floor");

// A throttle doubles the delay and pauses at least the minimum cooldown,
// escalating on repeated strikes and honoring longer Retry-After values.
limiter = fresh();
assert.equal(limiter.onThrottle(), MIN_COOLDOWN_MS);
assert.equal(limiter.delay, 2000);
assert.equal(limiter.onThrottle(5000), MIN_COOLDOWN_MS * 2);
assert.equal(limiter.onThrottle(5 * 60_000), 5 * 60_000);
assert.equal(limiter.onThrottle(MAX_COOLDOWN_MS + 1), null, "refuse pauses too long to wait out");
for (let i = 0; i < 10; i++) limiter.onThrottle();
assert.equal(limiter.delay, MAX_DELAY_MS);
assert.ok(limiter.onThrottle() <= MAX_COOLDOWN_MS);

// A throttle resets the clean streak.
limiter = fresh();
for (let i = 0; i < SPEEDUP_STREAK - 1; i++) limiter.onSuccess();
limiter.onThrottle();
assert.equal(limiter.onSuccess(), false);

// Bot checks back off harder and stop speed-ups for the session.
limiter = fresh();
limiter.onBlocked();
assert.equal(limiter.delay, 3000);
for (let i = 0; i < SPEEDUP_STREAK * 3; i++) limiter.onSuccess();
assert.equal(limiter.delay, 3000);

// Learned delays carry over, clamped, and expire after a week.
const now = Date.UTC(2026, 10, 17);
assert.equal(new SiteRateLimiter({ baseDelay: 1000, learned: { delay: 700, updatedAt: now - 1000 }, now }).delay, 700);
assert.equal(new SiteRateLimiter({ baseDelay: 1000, learned: { delay: 100, updatedAt: now }, now }).delay, 500);
assert.equal(new SiteRateLimiter({ baseDelay: 1000, learned: { delay: 9000, updatedAt: now - 8 * 86400_000 }, now }).delay, 1000);
assert.equal(new SiteRateLimiter({ baseDelay: 1000, learned: { delay: "bad", updatedAt: now }, now }).delay, 1000);
assert.deepEqual(fresh().snapshot(now), { delay: 1000, updatedAt: now });

// Retry-After accepts seconds or an HTTP date.
assert.equal(parseRetryAfter("120"), 120_000);
assert.equal(parseRetryAfter("Wed, 18 Nov 2026 00:01:00 GMT", Date.UTC(2026, 10, 18, 0, 0, 0)), 60_000);
assert.equal(parseRetryAfter("soon"), null);
assert.equal(parseRetryAfter(null), null);

console.log("Rate limiter checks passed: polite start, slow speed-up with floor, hard back-off, cooldowns, persistence, Retry-After.");
