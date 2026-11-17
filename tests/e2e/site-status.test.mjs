// Run with: node tests/e2e/site-status.test.mjs
import assert from "node:assert/strict";
import { probe, classifyProbe } from "./site-status.mjs";

const up = { status: 200 };
assert.equal(classifyProbe(up, up).verdict, "up");
assert.equal(classifyProbe(up, { status: 403 }).verdict, "up", "a Cloudflare 403 still proves the site is up");
assert.equal(classifyProbe({ status: 530 }, up).verdict, "down", "Cloudflare origin errors mean the site is down");
assert.match(classifyProbe({ error: "ENOTFOUND" }, up).reason, /site down \(ENOTFOUND\)/);
assert.match(classifyProbe(up, { status: 503 }).reason, /novel page unavailable \(HTTP 503\), homepage up/);
assert.equal(classifyProbe(up, { status: 404 }).verdict, "gone");
assert.equal(classifyProbe(up, { status: 410 }).verdict, "gone");

assert.deepEqual(await probe("https://x.example", async () => ({ status: 301 })), { status: 301 });
const dns = Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } });
assert.deepEqual(await probe("https://x.example", async () => { throw dns; }), { error: "ENOTFOUND" });

console.log("Site status checks passed: up, down, origin errors, removed novels, and Cloudflare 403s.");
