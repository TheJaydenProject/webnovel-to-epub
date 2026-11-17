// Run with: node tests/charset.mjs
import assert from "node:assert/strict";
import { decodeHtml } from "../core/Charset.js";

// "下一章" in GBK, declared only in a <meta> tag (kanunu8.com).
const gbkPage = new Uint8Array([
  ...new TextEncoder().encode('<meta http-equiv="Content-Type" content="text/html; charset=gbk" /><a>'),
  0xcf, 0xc2, 0xd2, 0xbb, 0xd5, 0xc2,
  ...new TextEncoder().encode("</a>"),
]);
assert.match(decodeHtml(gbkPage.buffer, "text/html"), /<a>下一章<\/a>/);

// The header wins over the page, and UTF-8 is the default.
const utf8 = new TextEncoder().encode("<p>café</p>");
assert.equal(decodeHtml(utf8.buffer, "text/html; charset=utf-8"), "<p>café</p>");
assert.equal(decodeHtml(utf8.buffer, null), "<p>café</p>");
assert.equal(decodeHtml(utf8.buffer, "text/html; charset=not-a-charset"), "<p>café</p>");
assert.match(decodeHtml(new TextEncoder().encode('<meta charset="utf-8"><p>é</p>').buffer, ""), /é/);

console.log("Charset checks passed: meta-declared GBK, header charset, UTF-8 default, unknown labels.");
