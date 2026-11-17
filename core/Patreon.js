// Patreon renders posts client-side, so chapters are read from the JSON:API
// that patreon.com's own pages call. A "novel" is a collection (the creator's
// own grouping of chapters) or, failing that, every post by one creator.
// Everything here is pure: callers pass in a `getJson(url)` transport.

const API = "https://www.patreon.com/api";
const PAGE_SIZE = 500;
const MAX_LIST_PAGES = 40; // 20,000 posts; guards against a cursor loop.

// First path segments on patreon.com that are app pages, not creator names.
const RESERVED = new Set([
  "home", "search", "login", "signup", "messages", "settings", "notifications",
  "explore", "checkout", "membership", "library", "posts", "collection", "api",
  "about", "policy", "legal", "join", "creators", "pricing", "become-a-patron",
]);

// What a patreon.com URL points at: a collection, a creator, or a single post.
export function parsePatreonUrl(url) {
  const path = new URL(url).pathname.replace(/\/+$/, "");
  const collection = path.match(/^\/collection\/(\d+)$/);
  if (collection) return { collectionId: collection[1] };
  const post = path.match(/^(?:\/[^/]+)?\/posts\/(?:[^/]*-)?(\d+)$/);
  if (post) return { postId: post[1] };
  const creator = path.match(/^\/(?:c\/)?([A-Za-z0-9_.-]+)(?:\/(?:posts|collections|about))?$/);
  if (creator && !RESERVED.has(creator[1].toLowerCase())) return { vanity: creator[1] };
  return null;
}

function apiUrl(path, params) {
  const url = new URL(`${API}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, value);
  }
  url.searchParams.set("json-api-version", "1.0");
  return url.href;
}

function firstImage(...candidates) {
  return candidates.find((c) => typeof c === "string" && /^https?:/.test(c)) || null;
}

async function listPosts(getJson, params) {
  const posts = [];
  let cursor = null;
  for (let page = 0; page < MAX_LIST_PAGES; page++) {
    const json = await getJson(apiUrl("posts", {
      ...params,
      "filter[contains_exclusive_posts]": "true",
      "filter[is_draft]": "false",
      "fields[post]": "title,published_at,current_user_can_view,url",
      "page[size]": PAGE_SIZE,
      "page[cursor]": cursor,
      "json-api-use-default-includes": "false",
    }));
    posts.push(...(json.data || []));
    cursor = json.meta?.pagination?.cursors?.next;
    if (!cursor) break;
  }
  return posts;
}

// A book reads oldest first, but collections are often shown newest first.
// Date-sorted collections are re-sorted by date. A hand-arranged ("custom")
// order is kept, unless it mostly runs newest first (creators commonly pin the
// latest chapter on top), in which case it is reversed.
export function orderPosts(posts, sortType) {
  const date = (p) => String(p.attributes?.published_at || "");
  if (sortType !== "custom") return [...posts].sort((a, b) => date(a).localeCompare(date(b)));
  let newerFirst = 0;
  for (let i = 1; i < posts.length; i++) newerFirst += Math.sign(date(posts[i - 1]).localeCompare(date(posts[i])));
  return newerFirst > 0 ? [...posts].reverse() : posts;
}

function toChapters(posts) {
  return posts.map((post, i) => ({
    index: i + 1,
    patreonPostId: post.id,
    href: post.attributes?.url || `https://www.patreon.com/posts/${post.id}`,
    label: (post.attributes?.title || "").trim() || `Post ${post.id}`,
    locked: post.attributes?.current_user_can_view === false,
  }));
}

export async function loadCollection(getJson, collectionId) {
  const json = await getJson(apiUrl(`collection/${collectionId}`, {
    include: "campaign",
    "fields[collection]": "title,post_sort_type,thumbnail",
    "fields[campaign]": "name,avatar_photo_url",
  }));
  const attrs = json.data?.attributes || {};
  const campaign = json.included?.find((x) => x.type === "campaign");
  if (!campaign) throw new Error("Patreon did not say which creator owns this collection.");
  const posts = await listPosts(getJson, {
    "filter[campaign_id]": campaign.id,
    "filter[collection_id]": collectionId,
    sort: "collection_order",
  });
  return {
    novelTitle: (attrs.title || "").trim() || "Untitled",
    author: campaign.attributes?.name || "Unknown",
    coverUrl: firstImage(attrs.thumbnail?.default_large, attrs.thumbnail?.original, attrs.thumbnail?.url, campaign.attributes?.avatar_photo_url),
    chapters: toChapters(orderPosts(posts, attrs.post_sort_type)),
  };
}

export async function loadCreator(getJson, vanity) {
  const json = await getJson(apiUrl("campaigns", {
    "filter[vanity]": vanity,
    "fields[campaign]": "name,avatar_photo_url",
  }));
  const campaign = json.data?.[0];
  if (!campaign) throw new Error(`No Patreon creator named "${vanity}" was found.`);
  const posts = await listPosts(getJson, { "filter[campaign_id]": campaign.id, sort: "published_at" });
  const collections = await getJson(apiUrl("collection", {
    "filter[campaign_id]": campaign.id,
    "fields[collection]": "title,num_posts",
  })).then((c) => c.data || [], () => []);
  return {
    novelTitle: campaign.attributes?.name || vanity,
    author: campaign.attributes?.name || vanity,
    coverUrl: firstImage(campaign.attributes?.avatar_photo_url),
    chapters: toChapters(posts),
    collections: collections.map((c) => ({
      title: c.attributes?.title || `Collection ${c.id}`,
      count: c.attributes?.num_posts,
      url: `https://www.patreon.com/collection/${c.id}`,
    })),
  };
}

// One post's body as HTML, or `{ locked: true }` when the signed-in account
// (or a signed-out visitor) cannot read it.
export async function loadPostHtml(getJson, postId) {
  const json = await getJson(apiUrl(`posts/${postId}`, {
    "fields[post]": "title,content,content_json_string,current_user_can_view",
    "json-api-use-default-includes": "false",
  }));
  const attrs = json.data?.attributes || {};
  if (attrs.current_user_can_view === false) return { locked: true };
  if (attrs.content) return { html: attrs.content };
  if (!attrs.content_json_string) return { html: "" };
  return { html: patreonDocToHtml(JSON.parse(attrs.content_json_string)) };
}

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const safeHref = (href) => (/^https?:\/\//i.test(href || "") ? href : null);

const MARK_TAGS = { bold: "strong", italic: "em", underline: "u", strike: "s", code: "code", superscript: "sup", subscript: "sub" };

function renderText(node) {
  let html = escapeHtml(node.text || "");
  for (const mark of node.marks || []) {
    if (mark.type === "link") {
      const href = safeHref(mark.attrs?.href);
      if (href) html = `<a href="${escapeHtml(href)}">${html}</a>`;
    } else if (MARK_TAGS[mark.type]) {
      const tag = MARK_TAGS[mark.type];
      html = `<${tag}>${html}</${tag}>`;
    }
  }
  return html;
}

// Patreon's editor stores newer posts as a ProseMirror document instead of
// HTML. Node types seen on live posts are mapped; unknown nodes keep their
// text so a new editor feature never silently drops part of a chapter.
export function patreonDocToHtml(node) {
  if (!node || typeof node !== "object") return "";
  const inner = () => (node.content || []).map(patreonDocToHtml).join("");
  switch (node.type) {
    case "text": return renderText(node);
    case "paragraph": return `<p>${inner()}</p>`;
    case "heading": {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level) || 2));
      return `<h${level}>${inner()}</h${level}>`;
    }
    case "blockquote": return `<blockquote>${inner()}</blockquote>`;
    case "bulletList": return `<ul>${inner()}</ul>`;
    case "orderedList": {
      const start = Number(node.attrs?.order);
      return `<ol${start > 1 ? ` start="${start}"` : ""}>${inner()}</ol>`;
    }
    case "listItem": return `<li>${inner()}</li>`;
    case "hardBreak": return "<br>";
    case "horizontalRule": return "<hr>";
    case "image": {
      const src = safeHref(node.attrs?.src);
      if (!src) return "";
      const caption = node.attrs?.caption ? `<figcaption>${escapeHtml(node.attrs.caption)}</figcaption>` : "";
      return `<figure><img src="${escapeHtml(src)}" alt="${escapeHtml(node.attrs?.alt || "")}">${caption}</figure>`;
    }
    case "caption": return `<p><em>${inner()}</em></p>`;
    default: return inner();
  }
}
