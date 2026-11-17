// Run with: node tests/patreon.mjs
import assert from "node:assert/strict";
import { parsePatreonUrl, orderPosts, patreonDocToHtml, loadCollection, loadPostHtml } from "../core/Patreon.js";

// URL shapes users paste.
assert.deepEqual(parsePatreonUrl("https://www.patreon.com/collection/1585756"), { collectionId: "1585756" });
assert.deepEqual(parsePatreonUrl("https://www.patreon.com/collection/1585756?view=expanded"), { collectionId: "1585756" });
assert.deepEqual(parsePatreonUrl("https://www.patreon.com/Shirtaloon"), { vanity: "Shirtaloon" });
assert.deepEqual(parsePatreonUrl("https://www.patreon.com/c/Shirtaloon/posts"), { vanity: "Shirtaloon" });
assert.deepEqual(parsePatreonUrl("https://www.patreon.com/posts/chapter-1602-175043154"), { postId: "175043154" });
assert.deepEqual(parsePatreonUrl("https://www.patreon.com/Shirtaloon/posts/chapter-1060-of-173850621"), { postId: "173850621" });
assert.equal(parsePatreonUrl("https://www.patreon.com/home"), null);

// Newest-first collections are read oldest first; custom order is kept.
const posts = [
  { id: "3", attributes: { published_at: "2026-03-01" } },
  { id: "1", attributes: { published_at: "2026-01-01" } },
  { id: "2", attributes: { published_at: "2026-02-01" } },
];
assert.deepEqual(orderPosts(posts, "new_to_old").map((p) => p.id), ["1", "2", "3"]);
assert.deepEqual(orderPosts(posts, "custom").map((p) => p.id), ["3", "1", "2"]);
const newestFirst = [posts[0], posts[2], posts[1]];
assert.deepEqual(orderPosts(newestFirst, "custom").map((p) => p.id), ["1", "2", "3"]);

// ProseMirror documents become HTML; text is escaped and unsafe links dropped.
const doc = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Chapter 1" }] },
    { type: "paragraph", content: [
      { type: "text", text: "a < b & ", marks: [{ type: "bold" }, { type: "italic" }] },
      { type: "text", text: "site", marks: [{ type: "link", attrs: { href: "https://example.com/?a=1&b=2" } }] },
      { type: "text", text: "bad", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] },
      { type: "hardBreak" },
    ] },
    { type: "orderedList", attrs: { order: 3 }, content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }] }] },
    { type: "image", attrs: { src: "https://c10.patreonusercontent.com/a.png", alt: "Map", caption: "The map" } },
    { type: "horizontalRule" },
    { type: "mysteryBlock", content: [{ type: "text", text: "kept" }] },
  ],
};
assert.equal(patreonDocToHtml(doc),
  "<h3>Chapter 1</h3>"
  + '<p><em><strong>a &lt; b &amp; </strong></em><a href="https://example.com/?a=1&amp;b=2">site</a>bad<br></p>'
  + '<ol start="3"><li><p>x</p></li></ol>'
  + '<figure><img src="https://c10.patreonusercontent.com/a.png" alt="Map"><figcaption>The map</figcaption></figure>'
  + "<hr>kept");

// A collection lists every page of posts, under the creator that owns it.
const requests = [];
const api = {
  collection: { data: { id: "77", attributes: { title: "My Novel ", post_sort_type: "new_to_old", thumbnail: { default_large: "https://img/cover.jpg" } } },
    included: [{ id: "9", type: "campaign", attributes: { name: "Author" } }] },
  page1: { data: [{ id: "12", attributes: { title: "Chapter 2", published_at: "2026-02-01", current_user_can_view: false } }],
    meta: { pagination: { cursors: { next: "abc" } } } },
  page2: { data: [{ id: "11", attributes: { title: "Chapter 1", published_at: "2026-01-01", current_user_can_view: true, url: "https://www.patreon.com/posts/chapter-1-11" } }],
    meta: { pagination: { cursors: { next: null } } } },
};
const getJson = async (url) => {
  requests.push(url);
  const u = new URL(url);
  if (u.pathname === "/api/collection/77") return api.collection;
  assert.equal(u.searchParams.get("filter[campaign_id]"), "9");
  assert.equal(u.searchParams.get("filter[collection_id]"), "77");
  return u.searchParams.get("page[cursor]") === "abc" ? api.page2 : api.page1;
};
const novel = await loadCollection(getJson, "77");
assert.equal(novel.novelTitle, "My Novel");
assert.equal(novel.author, "Author");
assert.equal(novel.coverUrl, "https://img/cover.jpg");
assert.deepEqual(novel.chapters.map((c) => [c.index, c.patreonPostId, c.label, c.locked]), [[1, "11", "Chapter 1", false], [2, "12", "Chapter 2", true]]);
assert.equal(novel.chapters[0].href, "https://www.patreon.com/posts/chapter-1-11");
assert.equal(requests.length, 3);

// Post bodies: HTML wins, documents are rendered, locked posts say so.
const postJson = (attributes) => async () => ({ data: { id: "1", attributes } });
assert.deepEqual(await loadPostHtml(postJson({ current_user_can_view: false, content: null }), "1"), { locked: true });
assert.deepEqual(await loadPostHtml(postJson({ current_user_can_view: true, content: "<p>old</p>" }), "1"), { html: "<p>old</p>" });
assert.deepEqual(await loadPostHtml(postJson({ current_user_can_view: true, content: null,
  content_json_string: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "new" }] }] }) }), "1"), { html: "<p>new</p>" });

console.log("Patreon checks passed: URL shapes, reading order, document rendering, paged collections, locked posts.");
