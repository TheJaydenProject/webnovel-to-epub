// Declarative per-site scraping configuration. To support a new site, add
// an entry here - no other code should need to change.

// Boilerplate element patterns common to virtually every site config below -
// merged into each site's own elementBlacklist instead of repeating it.
const DEFAULT_ELEMENT_BLACKLIST = [
  "script",
  "style",
  "noscript",
  "iframe",
  "ins",
  '[class*="ad-"]',
  '[class*="advert"]',
];

export const SITE_CONFIGS = [
  {
    id: "mistminthaven",
    hostnamePattern: /(^|\.)mistminthaven\.com$/,
    preferTocDiscovery: true,
    requiresTabFetch: true,
    sampleUrls: {
      toc: "https://www.mistminthaven.com/novels/an-investor-who-sees-the-future",
      firstChapter: "https://www.mistminthaven.com/novels/an-investor-who-sees-the-future/chapter-0",
    },
    toc: {
      titleSelector: "h1",
      coverSelector: 'meta[property="og:image"]',
      coverAttr: "content",
      linksSelector: "a[data-epub-chapter]",
    },
    content: {
      bodySelector: "#chapter-content-text",
      allowContentFallback: false,
      chapterTitleSelector: "h1",
    },
    siteName: "Mistmint Haven",
    elementBlacklist: [...DEFAULT_ELEMENT_BLACKLIST],
    fetchIntervalBase: 1000,
    fetchJitterRange: 600,
  },
  {
    id: "noveltl",
    hostnamePattern: /(^|\.)noveltl\.com$/,
    sampleUrls: {
      toc: "https://noveltl.com/series/novelist-running-through-time/",
      firstChapter: "https://noveltl.com/chapter-1-cause-of-death/",
    },
    toc: {
      titleSelector: "h1.entry-title",
      coverSelector: "img.ts-post-image",
      coverAttr: "src",
      linksSelector: ".eplisterfull li a",
      chapterIndexFromHrefRegex: /chapter-(\d+(?:\.\d+)?)(?:[/-]|$)/i,
      authorSourceRegex: /<span class="sername">Author<\/span>\s*<span class="serval">\s*<a\b[^>]*>([^<]*)<\/a>/,
    },
    content: {
      bodySelector: ".epcontent.entry-content",
      nextLinkSelector: 'a[rel="next"]',
      nextLinkTextMatch: /^\s*Next\s*$/i,
      allowContentFallback: false,
    },
    siteName: "Novel Translations",
    elementBlacklist: [...DEFAULT_ELEMENT_BLACKLIST],
    fetchIntervalBase: 1000,
    fetchJitterRange: 600,
  },
  {
    id: "woopread",
    hostnamePattern: /(^|\.)woopread\.com$/,
    sampleUrls: {
      toc: "https://woopread.com/series/prince-rage",
      firstChapter: "https://woopread.com/series/prince-rage/chapter-0-prologue",
    },
    toc: {
      titleSelector: 'meta[property="og:title"]',
      titleAttr: "content",
      coverSelector: 'meta[property="og:image"]',
      coverAttr: "content",
      linksSelector: "#chapter-list-container a",
      // The index initially shows only the latest 12 chapters. Walk from
      // Read Now instead, including prologues and non-numbered chapters.
      firstChapterSelector: 'a[href*="/series/"]',
      firstChapterTextMatch: /^\s*Read Now\s*$/i,
      authorSourceRegex: /Author(?:<!--\s*-->)?\s*:<\/span>\s*<a\b[^>]*>([^<]*)<\/a>/,
    },
    content: {
      bodySelector: 'div[id^="chapter-"]:not(#chapter-list-container)',
      nextLinkSelector: 'a[href*="/series/"]',
      nextLinkTextMatch: /^\s*Next\s*$/i,
      lockedTextMatch: /^\s*$/,
      // Never mistake comments or subscription prompts for a missing body.
      allowContentFallback: false,
    },
    siteName: "WoopRead",
    elementBlacklist: [...DEFAULT_ELEMENT_BLACKLIST, "button", "svg"],
    tabFetchDelay: 2000,
    fetchIntervalBase: 1000,
    fetchJitterRange: 600,
  },
  {
    id: "wattpad",
    hostnamePattern: /(^|\.)wattpad\.com$/,
    sampleUrls: {
      toc: "https://www.wattpad.com/story/411193048-the-billionaire%27s-unwanted-bride-completed",
      firstChapter: "https://www.wattpad.com/1628072234-the-billionaire%27s-unwanted-bride-completed-intro%2B",
    },
    toc: {
      // No og:title meta tag on this site - read the <title> tag itself.
      // titleAttr is intentionally omitted so this falls back to textContent.
      titleSelector: "title",
      // The <title> is "{Novel Title} - {Author} - Wattpad" - strip the
      // "- {Author} - Wattpad" suffix so chapter-title extraction can match
      // the novel title prefix.
      titleSuffixRegex: /\s*-[^-]*-\s*Wattpad\s*$/i,
      // No og:image meta tag either - this is the story's cover <img> in the
      // page header.
      coverSelector: "img.cover__BlyZa",
      coverAttr: "src",
      // The full chapter list is embedded as JSON in a script tag, not as
      // <a> elements - this won't match anything. Use the "First chapter
      // URL" field for discovery via next-chapter link-walking.
      linksSelector: "a[data-chapter-index]",
      authorSourceRegex: /"author":\{"name":"([^"]*)"/,
    },
    content: {
      bodySelector: "div.panel-reading",
      nextLinkSelector: "#story-part-navigation a",
      nextLinkTextMatch: /next part/i,
    },
    withinChapterPagination: {
      // Long chapters paginate across /page/2, /page/3, … Each is a
      // server-rendered route returning that page's content directly.
      // The URL changes client-side as the user scrolls, but fetching
      // /page/N directly always works.
      pageUrlSuffix: "/page/",
    },
    siteName: "Wattpad",
    elementBlacklist: [
      ...DEFAULT_ELEMENT_BLACKLIST,
      // Empty placeholder for Wattpad's text-to-speech widget.
      ".trinityAudioPlaceholder",
    ],
    fetchIntervalBase: 800,
    fetchJitterRange: 600,
  },
  {
    // Read through Patreon's JSON API (core/Patreon.js), not by scraping pages:
    // posts render client-side. The toc/content fields are unused.
    id: "patreon",
    hostnamePattern: /(^|\.)patreon\.com$/,
    sampleUrls: {
      toc: "https://www.patreon.com/collection/2377730",
      skipChapters: 1,
    },
    toc: { titleSelector: "title", linksSelector: "a[href*='/posts/']" },
    content: { bodySelector: null },
    siteName: "Patreon",
    elementBlacklist: [...DEFAULT_ELEMENT_BLACKLIST],
    fetchIntervalBase: 1500,
    fetchJitterRange: 1000,
  },
  {
    id: "wuxiaworld",
    hostnamePattern: /(^|\.)wuxiaworld\.com$/,
    sampleUrls: {
      toc: "https://www.wuxiaworld.com/novel/example-novel",
      firstChapter: "https://www.wuxiaworld.com/novel/example-novel/example-chapter-1",
    },
    toc: {
      titleSelector: 'meta[property="og:title"]',
      titleAttr: "content",
      // The TOC title is "{Novel Title} | Wuxiaworld" - strip the suffix
      // so chapter-title extraction can match the novel title prefix.
      titleSuffixRegex: /\s*\|\s*Wuxiaworld\s*$/i,
      coverSelector: 'meta[property="og:image"]',
      coverAttr: "content",
      // The static TOC page only embeds a couple of chapter links - the
      // full list is loaded client-side. Use the "First chapter URL"
      // field for full discovery via next-chapter link-walking.
      linksSelector: 'a[href*="-chapter-"]',
      // Author name is embedded in a Next.js data blob as JSON.
      authorSourceRegex: /"authorName":\{"value":"([^"]*)"/,
    },
    content: {
      bodySelector: "div.chapter-content",
      // Used for "first chapter URL" fallback discovery: candidate links
      // are matched against this selector, then the one whose text starts
      // with "Next" is followed to find the next chapter.
      nextLinkSelector: 'a[href*="-chapter-"]',
      nextLinkTextMatch: /^\s*next/i,
      // Locked/early-access chapters render a truncated preview followed by
      // a "Log in to continue your adventure" prompt instead of the full
      // chapter. Used by "Use browser tab for fetching" to detect when a
      // plain fetch isn't seeing the same content as the logged-in user.
      lockedTextMatch: /log in to continue/i,
    },
    siteName: "Wuxiaworld",
    elementBlacklist: [
      ...DEFAULT_ELEMENT_BLACKLIST,
      // Inline "comment on this paragraph" buttons/badges.
      "button",
    ],
    fetchIntervalBase: 800,
    fetchJitterRange: 600,
  },
  {
    id: "ranovel",
    hostnamePattern: /(^|\.)ranovel\.com$/,
    sampleUrls: {
      toc: "https://ranovel.com/novel/abandoned-by-my-childhood-friend-i-became-a-war-hero/",
      firstChapter: "https://ranovel.com/novel/abandoned-by-my-childhood-friend-i-became-a-war-hero/chapter-1/",
    },
    toc: {
      titleSelector: 'meta[property="og:title"]',
      titleAttr: "content",
      // The og:title has a " Ranovel" suffix - strip it so chapter-title
      // extraction can match the novel title prefix.
      titleSuffixRegex: /\s*Ranovel\s*$/i,
      coverSelector: 'meta[property="og:image"]',
      coverAttr: "content",
      // This site (Madara theme) loads its chapter list client-side via
      // admin-ajax.php - it isn't present in the static TOC HTML, so this
      // won't match anything. Use the "First chapter URL" field for full
      // discovery via next-chapter link-walking.
      linksSelector: "li.wp-manga-chapter a",
      // Author name isn't in a meta tag - extract it from the
      // ".author-content" block in the raw page source.
      authorSourceRegex: /<div class="author-content">\s*<a[^>]*>([^<]+)<\/a>/,
    },
    content: {
      bodySelector: "div.reading-content",
      // Used for "first chapter URL" fallback discovery: candidate links
      // are matched against this selector, then the one whose text starts
      // with "Next" is followed to find the next chapter.
      nextLinkSelector: 'a[href*="/chapter-"]',
      nextLinkTextMatch: /^\s*next/i,
      // Chapter pages are served behind a Cloudflare JS challenge ("Just a
      // moment...") for plain fetches, so the content container won't be
      // found. Treating that as "locked" lets "Use browser tab for
      // fetching" retry via a real tab, which can pass the challenge.
      lockedTextMatch: /just a moment|enable javascript and cookies/i,
    },
    siteName: "Ranovel",
    elementBlacklist: [
      ...DEFAULT_ELEMENT_BLACKLIST,
      // Wraps a maintenance notice, the Ko-fi "Buy me a coffee" button, ad
      // scripts (Monetag/Pubfuture), and a hidden "ranovel.com" watermark
      // paragraph (text color matches its background, so it's invisible on
      // the site but shows up once the EPUB strips that styling) - strip
      // the whole block.
      ".code-block",
      // Defense in depth, in case the Ko-fi button appears outside .code-block.
      'a[href*="ko-fi.com"]',
      'img[src*="ko-fi.com"]',
    ],
    // Site-injected "read this on our site" boilerplate paragraphs, matched
    // with case/punctuation/spacing stripped (see normalizeForMatch) so
    // styled/obfuscated variants still match.
    textBlacklist: [/ranovel(com|dotcom)/],
    fetchIntervalBase: 800,
    fetchJitterRange: 600,
  },
  {
    id: "novelarrow",
    hostnamePattern: /(^|\.)novelarrow\.com$/,
    sampleUrls: {
      toc: "https://novelarrow.com/novel/the-most-arbitrary-wizard",
      firstChapter: "https://novelarrow.com/chapter/the-most-arbitrary-wizard/chapter-1-new-book-sets-sail",
    },
    toc: {
      titleSelector: 'meta[property="og:title"]',
      titleAttr: "content",
      // The og:title is "{Novel Title} Novel | Read Online on Novel Arrow" -
      // strip the suffix so chapter-title extraction can match the novel
      // title prefix.
      titleSuffixRegex: /\s*Novel\s*\|\s*Read Online on Novel ?Arrow\s*$/i,
      coverSelector: 'meta[property="og:image"]',
      coverAttr: "content",
      // This site (Next.js) paginates its chapter list client-side, so this
      // only matches whichever page of chapters happens to be in the static
      // HTML - not the full list. Use the "First chapter URL" field for full
      // discovery via next-chapter link-walking.
      linksSelector: 'a.group[href*="/chapter/"]',
      authorSourceRegex: /<meta name="author" content="([^"]*)"/,
    },
    content: {
      // The chapter body is rendered entirely client-side - this selector
      // matches nothing in the raw HTML, so `looksLocked` (below) always
      // reports "locked" and "Use browser tab for fetching" renders the page
      // for real before this is queried again.
      bodySelector: "article[data-chapter-id]",
      nextLinkSelector: 'a[aria-label="Next chapter"]',
      // The "Next chapter" link has no text (icon-only), so match any text.
      nextLinkTextMatch: /^/,
      // Never matches real chapter text - exists only so `looksLocked`
      // treats a missing `bodySelector` match (i.e. the un-rendered page) as
      // locked, triggering the browser-tab retry.
      lockedTextMatch: /^\s*$/,
    },
    siteName: "Read on NovelArrow",
    elementBlacklist: [
      ...DEFAULT_ELEMENT_BLACKLIST,
      // The chapter title heading - already shown via the EPUB's own
      // chapter title, so drop it from the body to avoid duplication.
      "h2",
    ],
    fetchIntervalBase: 800,
    fetchJitterRange: 600,
  },
  {
    id: "royalroad",
    hostnamePattern: /(^|\.)royalroad\.com$/,
    sampleUrls: {
      toc: "https://www.royalroad.com/fiction/151748/clara-casewell-attorney-to-the-villainess-vol",
      firstChapter: "https://www.royalroad.com/fiction/151748/clara-casewell-attorney-to-the-villainess-vol/chapter/3017867/chapter-1-happy-new-year-associate-righton",
    },
    toc: {
      // No og:title meta tag on this site - read the <title> tag itself.
      // titleAttr is intentionally omitted so this falls back to textContent.
      titleSelector: "title",
      titleSuffixRegex: /\s*\|\s*Royal Road\s*$/i,
      coverSelector: 'meta[property="og:image"]',
      coverAttr: "content",
      // The full chapter list is in the static TOC HTML as one <tr
      // class="chapter-row"> per chapter, each with two <a> links to the
      // same chapter (title cell and "updated" timestamp cell) - select
      // only the title cell's link.
      linksSelector: "tr.chapter-row > td:first-child > a",
      authorSourceRegex: /<meta property="books:author" content="([^"]*)"/,
    },
    content: {
      bodySelector: "div.chapter-inner.chapter-content",
      nextLinkSelector: 'a[href*="/chapter/"]',
      nextLinkTextMatch: /^\s*next/i,
    },
    siteName: "Royal Road",
    elementBlacklist: DEFAULT_ELEMENT_BLACKLIST,
    // Royal Road injects a hidden "stolen content" trap paragraph into each
    // chapter with a randomized per-request class name, hidden via an inline
    // <style> rule (display:none) - strip whatever that rule targets.
    stripCssHiddenElements: true,
    fetchIntervalBase: 800,
    fetchJitterRange: 600,
  },
  {
    id: "scribblehub",
    hostnamePattern: /(^|\.)scribblehub\.com$/,
    sampleUrls: {
      toc: "https://www.scribblehub.com/series/2393924/code-six-resident-evil/",
      firstChapter: "https://www.scribblehub.com/read/2393924-code-six-resident-evil/chapter/2393926/",
    },
    toc: {
      titleSelector: 'meta[property="og:title"]',
      titleAttr: "content",
      coverSelector: 'meta[property="og:image"]',
      coverAttr: "content",
      // The static TOC page only embeds one page of the table of contents -
      // long-running series paginate the rest via AJAX. Use the "First
      // chapter URL" field for full discovery via next-chapter link-walking.
      linksSelector: "a.toc_a",
      // Author name is in a schema.org "author" block as
      // <span class="auth_name_fic">Name</span>.
      authorSourceRegex: /<span class="auth_name_fic">([^<]*)<\/span>/,
    },
    content: {
      bodySelector: "#chp_raw",
      // Used for "first chapter URL" fallback discovery: candidate links
      // are matched against this selector, then the one whose text starts
      // with "Next" is followed to find the next chapter.
      nextLinkSelector: "a.btn-next",
      nextLinkTextMatch: /^\s*next/i,
    },
    siteName: "Scribble Hub",
    elementBlacklist: DEFAULT_ELEMENT_BLACKLIST,
    fetchIntervalBase: 800,
    fetchJitterRange: 600,
  },
  {
    id: "novelfire",
    // Renamed to Novel Phoenix in 2026; novelfire.net /book/ links redirect
    // to novelphoenix.com /novel/.
    hostnamePattern: /(^|\.)(novelfire\.net|novelphoenix\.com)$/,
    sampleUrls: {
      toc: "https://novelphoenix.com/novel/unclassified-zero-and-still-standing",
      firstChapter: "https://novelphoenix.com/novel/unclassified-zero-and-still-standing/chapter-1",
    },
    toc: {
      titleSelector: 'meta[property="og:title"]',
      titleAttr: "content",
      // The og:title has a " - Novel Fire" suffix - strip it so chapter-title
      // extraction can match the novel title prefix.
      titleSuffixRegex: /\s*-\s*Novel (Fire|Phoenix)\s*$/i,
      // The book page links only "Read Now" and the separate /chapters
      // page, so walk from chapter 1.
      firstChapterSelector: "nav.links a.button",
      firstChapterTextMatch: /^\s*Read Now/i,
      coverSelector: 'meta[property="og:image"]',
      coverAttr: "content",
      // The full chapter list lives on a separate "/chapters" sub-page
      // (ul.chapter-list), not on the book page given as the TOC URL - this
      // won't match anything there. Use the "First chapter URL" field for
      // full discovery via next-chapter link-walking.
      linksSelector: "ul.chapter-list li a",
      authorSourceRegex: /<span itemprop="author">([^<]*)<\/span>/,
    },
    content: {
      bodySelector: "#content",
      // The "Next chapter" link is icon-only (no text) - match on
      // rel="next" instead and accept any (empty) text.
      nextLinkSelector: 'a[rel="next"]',
      nextLinkTextMatch: /^/,
    },
    siteName: "Novel Phoenix",
    elementBlacklist: [
      ...DEFAULT_ELEMENT_BLACKLIST,
      // In-content ad placeholders.
      ".nf-ads",
    ],
    fetchIntervalBase: 800,
    fetchJitterRange: 600,
  },
  {
    id: "dreambigtl",
    hostnamePattern: /(^|\.)dreambigtl\.com$/,
    sampleUrls: {
      toc: "https://www.dreambigtl.com/p/tmam-mysterious-art-museum.html",
      firstChapter: "https://www.dreambigtl.com/2023/11/tmam-chapter-1.html",
    },
    toc: {
      // No og:title meta tag on this site - read the <title> tag itself.
      // titleAttr is intentionally omitted so this falls back to textContent.
      titleSelector: "title",
      // The cover lives in the TOC page's body as an <img alt="Novel Cover">.
      coverSelector: 'img[alt="Novel Cover"]',
      coverAttr: "src",
      // The full chapter list is in the static TOC HTML, grouped into
      // <details class="chapter-panel"> sections inside div.chapters.
      linksSelector: "div.chapters a",
      // No author info on the TOC page itself (it's only present in
      // per-post JSON-LD on chapter pages) - author is left unset.
    },
    content: {
      bodySelector: "#post-body",
      // The "Next Chapter" link is part of the post content itself, not a
      // template element - scope the search to the body.
      nextLinkSelector: "#post-body a",
      nextLinkTextMatch: /^\s*next/i,
    },
    // This Blogger site's configured blog title - appended to every page's
    // <title> as " - The Mysterious Art Museum", used to strip it from
    // chapter titles.
    siteName: "The Mysterious Art Museum",
    elementBlacklist: DEFAULT_ELEMENT_BLACKLIST,
    // The cover image and a "Bonus chapter thanks to..." blurb are injected
    // into #post-body as direct children with inline style="display:none" -
    // strip those.
    stripCssHiddenElements: true,
    fetchIntervalBase: 800,
    fetchJitterRange: 600,
  },
  {
    id: "novelbuddy",
    hostnamePattern: /(^|\.)novelbuddy\.com$/,
    sampleUrls: {
      toc: "https://novelbuddy.com/how-could-the-villainous-young-master-be-a-saintess",
      firstChapter: "https://novelbuddy.com/how-could-the-villainous-young-master-be-a-saintess/chapter-0-prologue-the-unlucky-fool-who-hit-the-jackpot",
    },
    toc: {
      // No og:title meta tag suffix stripping needed beyond " - NovelBuddy" -
      // titleAttr is intentionally omitted so this falls back to textContent.
      titleSelector: "title",
      titleSuffixRegex: /\s*-\s*NovelBuddy\s*$/i,
      coverSelector: 'meta[property="og:image"]',
      coverAttr: "content",
      // The TOC page only shows a paginated window of the latest chapters,
      // not the full list starting at chapter 1 - use the "First chapter
      // URL" field for full discovery via next-chapter link-walking.
      linksSelector: "ul.divide-y a",
      authorSourceRegex: /"author":\{"@type":"Person","name":"([^"]*)"\}/,
    },
    content: {
      bodySelector: "div.novel-tts-content",
      nextLinkSelector: 'a[href*="/chapter-"]',
      nextLinkTextMatch: /^\s*next/i,
    },
    siteName: "NovelBuddy",
    elementBlacklist: DEFAULT_ELEMENT_BLACKLIST,
    fetchIntervalBase: 800,
    fetchJitterRange: 600,
  },
  {
    id: "novelbin",
    // This site is mirrored on both novelbin.com and novelbin.me with
    // slightly different URL paths (/b/ vs /novel-book/) for the same
    // content - match either domain.
    hostnamePattern: /(^|\.)novelbin\.(?:me|com)$/,
    sampleUrls: {
      toc: "https://novelbin.me/novel-book/starting-check-in-reward-tomson-riviera",
      firstChapter: "https://novelbin.com/b/starting-check-in-reward-tomson-riviera/chapter-1-sign-in-at-the-start-for-tomson-riviera",
    },
    toc: {
      // No og:title meta tag - read the <title> tag itself. titleAttr is
      // intentionally omitted so this falls back to textContent.
      titleSelector: "title",
      // The <title> is "{Novel Title} Novel - Read {Novel Title} Online For
      // Free - Novel Bin" - strip the suffix so chapter-title extraction can
      // match the novel title prefix.
      titleSuffixRegex: /\s*Novel\s*-\s*Read\s+.+\s+Online For Free\s*-\s*Novel Bin\s*$/i,
      coverSelector: 'meta[property="og:image"]',
      coverAttr: "content",
      // The TOC page only embeds a handful of chapter links (first page plus
      // the latest chapter), not the full list - use the "First chapter URL"
      // field for full discovery via next-chapter link-walking.
      linksSelector: 'a[href*="/chapter-"]',
      authorSourceRegex: /<meta property="og:novel:author" content="([^"]*)"/,
    },
    content: {
      bodySelector: "#chr-content",
      nextLinkSelector: 'a.js-chapter-nav[data-chapter-nav="next"]',
      nextLinkTextMatch: /^\s*next/i,
      // Chapter <title> tags on this site repeat the novel and chapter
      // titles twice, in a "{Novel Title} #{Chapter Title} - Read {Novel
      // Title} {Chapter Title} Online - All Page - Novel Bin" format -
      // extract just the chapter title between "#" and " - Read ".
      chapterTitleSourceRegex: /#(.+?)\s*-\s*Read\s+/,
    },
    siteName: "Novel Bin",
    elementBlacklist: DEFAULT_ELEMENT_BLACKLIST,
    fetchIntervalBase: 800,
    fetchJitterRange: 600,
  },
  {
    id: "fenrirealm",
    hostnamePattern: /(^|\.)fenrirealm\.com$/,
    // The chapter list (toc.linksSelector) is the full list for this site,
    // and next-chapter link-walking can't work at all (see content below) -
    // always use the index page for discovery, even if a "First chapter
    // URL" is filled in.
    preferTocDiscovery: true,
    sampleUrls: {
      toc: "https://fenrirealm.com/series/this-useless-witch-is-so-weak-that-her-only-ability-is-to-reset-time",
      firstChapter: "https://fenrirealm.com/series/this-useless-witch-is-so-weak-that-her-only-ability-is-to-reset-time/1",
    },
    toc: {
      // No og:title meta tag - read the <title> tag itself. titleAttr is
      // intentionally omitted so this falls back to textContent.
      titleSelector: "title",
      titleSuffixRegex: /\s*-\s*Fenrir Realm\s*$/i,
      coverSelector: 'meta[property="og:image"]',
      coverAttr: "content",
      // The chapter list is rendered entirely client-side (requires "Use
      // browser tab for fetching" to discover), and is the full list - no
      // next-chapter link-walking needed. `[href*="/series/"]` excludes
      // unrelated "log in to bookmark" buttons that share this class.
      linksSelector: 'a.btn-chapter[href*="/series/"]',
      // The chapter list is newest-first in the DOM - derive the real
      // chapter number from the trailing "/series/{slug}/{N}" segment.
      chapterIndexFromHrefRegex: /\/(\d+)$/,
      // No author is shown anywhere on this site - leave authorSourceRegex
      // unset so it defaults to "Unknown".
    },
    content: {
      bodySelector: "div.reader-area",
      // The "Next Chapter" control is a client-side-routed <button> with no
      // href, so this never resolves to a URL - chapter discovery relies
      // entirely on the TOC's chapter list (above), not link-walking.
      nextLinkSelector: "button",
      nextLinkTextMatch: /^\s*next/i,
    },
    siteName: "Fenrir Realm",
    elementBlacklist: DEFAULT_ELEMENT_BLACKLIST,
    fetchIntervalBase: 800,
    fetchJitterRange: 600,
  },
  {
    id: "novelverse",
    // Moved from .online to .co in 2026; old links redirect.
    hostnamePattern: /(^|\.)novelverse\.(online|co)$/,
    sampleUrls: {
      toc: "https://novelverse.co/novel/the-legend-of-the-northern-blade",
      firstChapter: "https://novelverse.co/chapter/the-legend-of-the-northern-blade/lnb-chapter-1",
    },
    toc: {
      // No og:title meta tag - read the <title> tag itself. titleAttr is
      // intentionally omitted so this falls back to textContent.
      titleSelector: "title",
      titleSuffixRegex: /\s*-\s*NovelVerse\s*$/i,
      coverSelector: "img.object-cover",
      coverAttr: "src",
      // The index page only links the first and latest chapters - use the
      // "First chapter URL" field for full discovery via next-chapter
      // link-walking.
      linksSelector: 'a[href*="/chapter/"]',
      // The page is an Astro client-only island - its props (including the
      // author) are serialized as HTML-escaped JSON in a component
      // attribute, present even before hydration.
      authorSourceRegex: /&quot;author&quot;:\[0,&quot;([^"&]*)&quot;\]/,
    },
    content: {
      // The chapter body is rendered entirely client-side - this selector
      // matches nothing in the raw HTML, so `looksLocked` always reports
      // "locked" and "Use browser tab for fetching" renders the page for
      // real before this is queried again.
      bodySelector: ".prose",
      lockedTextMatch: /^\s*$/,
      // There's no "next chapter" link element at all (even after
      // hydration) - but the same Astro island props carry the next
      // chapter's slug as JSON, present in the raw HTML. On the last
      // chapter this is `"nextChapter":[0,null]`, which doesn't match, so
      // discovery stops there.
      nextLinkSourceRegex: /&quot;nextChapter&quot;:\[0,\{&quot;slug&quot;:\[0,&quot;([^"&]*)&quot;\]\}\]/,
      nextLinkUrlPrefix: "/chapter/",
    },
    siteName: "NovelVerse",
    elementBlacklist: DEFAULT_ELEMENT_BLACKLIST,
    fetchIntervalBase: 800,
    fetchJitterRange: 600,
  },
  {
    id: "wetriedtls",
    hostnamePattern: /(^|\.)wetriedtls\.com$/,
    sampleUrls: {
      toc: "https://wetriedtls.com/series/a-regressors-tale-of-cultivation",
      firstChapter: "https://wetriedtls.com/series/a-regressors-tale-of-cultivation/chapter-0",
    },
    toc: {
      // No og:title meta tag - read the <title> tag itself. titleAttr is
      // intentionally omitted so this falls back to textContent.
      titleSelector: "title",
      titleSuffixRegex: /\s*-\s*We Tried TLS\s*$/i,
      coverSelector: 'meta[property="og:image"]',
      coverAttr: "content",
      // This site (Next.js) only renders the most recently-added chapters'
      // links in the index page - use the "First chapter URL" field for
      // full discovery via next-chapter link-walking.
      linksSelector: 'a[href*="/chapter-"]',
      authorSourceRegex: /Author<\/span><span class="text-muted-foreground line-clamp-1">([^<]*)<\/span>/,
    },
    content: {
      // The chapter body is rendered entirely client-side - this selector
      // matches nothing in the raw HTML, so `looksLocked` always reports
      // "locked" and "Use browser tab for fetching" renders the page for
      // real before this is queried again.
      bodySelector: "#reader-container",
      // The "Next chapter" link is icon-only (no text), identified by its
      // chevron-right icon. On the last chapter it points back to the index
      // page instead of a chapter - the generic "next link points back to
      // the TOC page" check in findNextChapterLink stops discovery there.
      // (Not restricted to "/chapter-" hrefs, since bonus/interlude chapters
      // like "authors-tidbit-1" use a different URL pattern.)
      nextLinkSelector: 'a:has(svg[data-icon="chevron-right"])',
      nextLinkTextMatch: /^/,
      lockedTextMatch: /^\s*$/,
    },
    siteName: "We Tried TLS",
    elementBlacklist: DEFAULT_ELEMENT_BLACKLIST,
    fetchIntervalBase: 800,
    fetchJitterRange: 600,
  },
  {
    id: "dreamy-translations",
    hostnamePattern: /(^|\.)dreamy-translations\.com$/,
    requiresTabFetch: true,
    // Known-good URLs for this config, kept for manual testing / sanity
    // checks when tweaking selectors here or copying this entry for a
    // new site.
    sampleUrls: {
      toc: "https://dreamy-translations.com/novel/example-novel",
      firstChapter: "https://dreamy-translations.com/novel/example-novel/chapter/1",
    },
    toc: {
      titleSelector: 'meta[property="og:title"]',
      titleAttr: "content",
      // og:image points at a square-cropped social-preview thumbnail, not
      // the full cover - use the actual cover <img> on the page instead.
      coverSelector: "img.object-cover",
      coverAttr: "src",
      linksSelector: "a[data-chapter-index]",
      // The author name isn't in a plain DOM element on this site - it's
      // embedded in a Next.js RSC data blob as escaped JSON. Best effort
      // regex extraction against the raw page source, with a graceful
      // fallback if the markup changes.
      authorSourceRegex: /author\\":\\"([^"\\]*)\\"/,
    },
    content: {
      bodySelector: "article.chapter-content",
      allowContentFallback: false,
      // Translator's notes render in a box after the article; the [1], [2]
      // markers in the text point to it, so it is appended to the chapter.
      notesSelector: "main div.mt-16 > div.glass",
      notesTextMatch: /^\s*Translator'?s Notes/i,
      notesItemSelector: "div.flex.gap-3",
      // Used for "first chapter URL" fallback discovery: candidate links
      // are matched against this selector, then the one whose text starts
      // with "Next" is followed to find the next chapter.
      nextLinkSelector: 'a[href*="/chapter/"]',
      nextLinkTextMatch: /^\s*next/i,
    },
    siteName: "Dreamy Translations",
    elementBlacklist: DEFAULT_ELEMENT_BLACKLIST,
    fetchIntervalBase: 800,
    fetchJitterRange: 600,
  },
  // Three translation groups share the "jormuntl" WordPress theme.
  jormuntlConfig("mochistar", /(^|\.)mochistar\.org$/, "MochiStar Cafe", {
    toc: "https://mochistar.org/story/damn-the-male-leads-got-stolen-again/",
    firstChapter: "https://mochistar.org/story/damn-the-male-leads-got-stolen-again/87919-c1/",
  }),
  jormuntlConfig("oceanstale", /(^|\.)oceanstale\.com$/, "Ocean Tales", {
    toc: "https://oceanstale.com/novels/dont-act-aloof-with-me/",
    firstChapter: "https://oceanstale.com/chapter/daa-1/",
  }),
  jormuntlConfig("bailiantales", /(^|\.)bailiantales\.com$/, "BaiLianTales", {
    toc: "https://bailiantales.com/novel/how-long-are-you-going-to-keep-acting-cool-abo/",
    firstChapter: "https://bailiantales.com/novel/how-long-are-you-going-to-keep-acting-cool-abo/chapter-1/",
  }),
  {
    id: "kaystls",
    hostnamePattern: /(^|\.)kaystls\.site$/,
    // The chapter list (.kstoc-list) is filled in by script after load.
    requiresTabFetch: true,
    sampleUrls: {
      toc: "https://kaystls.site/frontier-magic-pharmacist/",
      firstChapter: "https://kaystls.site/frontier-magic-pharmacist/chapter-1/",
    },
    toc: {
      titleSelector: "title",
      titleSuffixRegex: /\s*[–-]\s*Kay's translations\s*$/i,
      coverSelector: 'meta[property="og:image"]',
      coverAttr: "content",
      linksSelector: ".kstoc-list a",
    },
    content: {
      // The chapter text is the only block-editor column with paragraphs;
      // .entry-content also wraps the site header.
      bodySelector: ".wp-block-column:has(> p + p)",
      nextLinkSelector: ".wp-block-column a",
      nextLinkTextMatch: /^\s*Next Chapter/i,
    },
    siteName: "Kay's translations",
    // The TOC | Next Chapter row inside the column.
    elementBlacklist: [...DEFAULT_ELEMENT_BLACKLIST, "p:has(> a)"],
    fetchIntervalBase: 1000,
    fetchJitterRange: 600,
  },
  {
    id: "peachpuff",
    hostnamePattern: /(^|\.)peachpuff\.in$/,
    sampleUrls: {
      toc: "https://peachpuff.in/story/beyond-the-outline/",
      firstChapter: "https://peachpuff.in/chapter/bto-ch1/",
    },
    toc: {
      titleSelector: "h1.story__identity-title",
      // og:image is the site logo; the story's own cover is the thumbnail.
      coverSelector: ".story__thumbnail img",
      coverAttr: "src",
      linksSelector: ".chapter-group__list-item-link",
    },
    content: {
      bodySelector: ".chapter-formatting",
      nextLinkSelector: "a._navigation._next",
      nextLinkTextMatch: /^\s*Next/i,
    },
    siteName: "Peach Puff Translations",
    elementBlacklist: DEFAULT_ELEMENT_BLACKLIST,
    fetchIntervalBase: 1000,
    fetchJitterRange: 600,
  },
  {
    id: "readthedrama",
    hostnamePattern: /(^|\.)readthedrama\.com$/,
    // Chapter text is rendered by script; only the index is in the HTML.
    requiresTabFetch: true,
    sampleUrls: {
      toc: "https://www.readthedrama.com/novels/when-i-meet-the-moon",
      firstChapter: "https://www.readthedrama.com/novels/when-i-meet-the-moon/chapters/1",
    },
    toc: {
      titleSelector: "h1",
      coverSelector: 'meta[property="og:image"]',
      coverAttr: "content",
      linksSelector: 'div.divide-y a[href*="/chapters/"]',
      chapterIndexFromHrefRegex: /\/chapters\/(\d+)/,
    },
    content: {
      bodySelector: "article",
      nextLinkSelector: 'a[href*="/chapters/"]',
      nextLinkTextMatch: /^\s*Next/i,
    },
    siteName: "ReadTheDrama",
    elementBlacklist: DEFAULT_ELEMENT_BLACKLIST,
    fetchIntervalBase: 1000,
    fetchJitterRange: 600,
  },
  {
    id: "konkon",
    hostnamePattern: /(^|\.)konkon\.ink$/,
    // Chapter text and its Next link are rendered by script.
    requiresTabFetch: true,
    sampleUrls: {
      toc: "https://konkon.ink/read/an-ordinary-game-streamers-true-colors-are-exposed-to-the-world-after-footage-goes-viral-showing-him-losing-his-temper-and-ruthlessly-slaughtering-monsters-to-blow-off-steam",
      firstChapter: "https://konkon.ink/read/chapter/61976/chapter-1-the-overstressed-streamer-heads-into-the-dungeon",
    },
    toc: {
      titleSelector: "h1",
      coverSelector: 'meta[property="og:image"]',
      coverAttr: "content",
      // Each row also has a "View" button to the same chapter; take the title link only.
      linksSelector: ".chapter-row a.truncate",
    },
    content: {
      bodySelector: "article.prose",
      nextLinkSelector: 'a[href*="/read/chapter/"]',
      nextLinkTextMatch: /^\s*Next/i,
    },
    siteName: "Konkon",
    elementBlacklist: DEFAULT_ELEMENT_BLACKLIST,
    fetchIntervalBase: 1000,
    fetchJitterRange: 600,
  },
  {
    id: "cuttlefishreads",
    hostnamePattern: /(^|\.)cuttlefishreads\.com$/,
    sampleUrls: {
      toc: "https://www.cuttlefishreads.com/novels/cloudy-turning-to-snoring",
      firstChapter: "https://www.cuttlefishreads.com/novels/cloudy-turning-to-snoring/1",
    },
    toc: {
      titleSelector: "h1",
      coverSelector: 'meta[property="og:image"]',
      coverAttr: "content",
      linksSelector: "ol.divide-y li a",
    },
    content: {
      bodySelector: ".chapter-prose",
      nextLinkSelector: 'a[href*="/novels/"]',
      nextLinkTextMatch: /Next chapter/i,
    },
    siteName: "Cuttlefish",
    // Scrambled decoy paragraphs are mixed into the text, hidden from
    // readers and screen readers alike.
    elementBlacklist: [...DEFAULT_ELEMENT_BLACKLIST, "[hidden]", '[aria-hidden="true"]'],
    fetchIntervalBase: 1000,
    fetchJitterRange: 600,
  },
  {
    id: "hostednovel",
    hostnamePattern: /(^|\.)hostednovel\.com$/,
    // Chapter pages have no next-chapter link, so the paginated index is
    // the only way to list chapters.
    preferTocDiscovery: true,
    sampleUrls: {
      toc: "https://hostednovel.com/novel/necromancer-i-am-a-disaster",
      firstChapter: "https://hostednovel.com/novel/necromancer-i-am-a-disaster/chapter-1",
    },
    toc: {
      titleSelector: "h1",
      coverSelector: 'img[src*="/covers/"]',
      coverAttr: "src",
      // 100 chapters per page, newest first; the number in the URL orders them.
      linksSelector: 'li.min-w-0 > a[href*="/chapter-"]',
      chapterIndexFromHrefRegex: /\/chapter-(\d+)$/,
      nextPageSelector: 'a[href*="page="]',
      nextPageTextMatch: /^\s*Next\s*$/i,
      authorSourceRegex: />Author<\/dt>\s*<dd[^>]*>(?:<!--\[-->)?([^<]+)/,
    },
    content: {
      bodySelector: ".chapter-body",
      nextLinkSelector: 'a[rel="next"]',
      nextLinkTextMatch: /^/,
    },
    siteName: "Hosted Novel",
    elementBlacklist: DEFAULT_ELEMENT_BLACKLIST,
    fetchIntervalBase: 1000,
    fetchJitterRange: 600,
  },
  {
    id: "lightnovelasia",
    hostnamePattern: /(^|\.)lightnovelasia\.com$/,
    // A single-page app: nothing but a shell arrives without a browser tab.
    requiresTabFetch: true,
    sampleUrls: {
      toc: "https://lightnovelasia.com/novel/great-qin-who-dared-provoke-my-frail-and-sickly-xian-qing",
      firstChapter: "https://lightnovelasia.com/great-qin-who-dared-provoke-my-frail-and-sickly-xian-qing-chapter-1",
    },
    toc: {
      titleSelector: "h1",
      coverSelector: 'meta[property="og:image"]',
      coverAttr: "content",
      linksSelector: "a.novel-chapter-card",
      // The index shows only the latest dozen chapters; walk from chapter 1.
      firstChapterSelector: "a.novel-primary-action",
      firstChapterTextMatch: /^\s*Start reading/i,
    },
    content: {
      bodySelector: "article",
      nextLinkSelector: "a.ch-nav-btn--next",
      nextLinkTextMatch: /^\s*Next/i,
    },
    siteName: "LightNovelAsia",
    elementBlacklist: DEFAULT_ELEMENT_BLACKLIST,
    // The chapter text renders before the Next button does.
    tabFetchDelay: 3000,
    fetchIntervalBase: 1000,
    fetchJitterRange: 600,
  },
  {
    id: "novelito",
    hostnamePattern: /(^|\.)noveli\.to$/,
    // A single-page app: the chapter list and text are rendered by script.
    requiresTabFetch: true,
    sampleUrls: {
      toc: "https://noveli.to/novel/almighty-student",
      firstChapter: "https://noveli.to/read/4202/906084",
    },
    toc: {
      titleSelector: "h1",
      coverSelector: 'meta[property="og:image"]',
      coverAttr: "content",
      // The full list, oldest first; excludes the "Start Reading" button.
      linksSelector: 'div.grid > a[href^="/read/"]',
    },
    content: {
      // Each paragraph is its own div#p-N.
      bodySelector: 'div:has(> div[id^="p-"])',
      nextLinkSelector: 'a[href^="/read/"]',
      nextLinkTextMatch: /^\s*Next/i,
      // <title> is "Read {Novel} Chapter 1 Online Free | Novelito".
      chapterTitleSelector: "h1",
    },
    siteName: "Novelito",
    elementBlacklist: DEFAULT_ELEMENT_BLACKLIST,
    fetchIntervalBase: 1000,
    fetchJitterRange: 600,
  },
  {
    id: "kanunu8",
    hostnamePattern: /(^|\.)kanunu8\.com$/,
    sampleUrls: {
      toc: "https://www.kanunu8.com/book7/dbsbfding/",
      firstChapter: "https://www.kanunu8.com/book7/dbsbfding/436672.html",
    },
    toc: {
      titleSelector: "h1",
      coverSelector: "img.cover",
      coverAttr: "src",
      // Chapter links are relative ("436673.html"); site navigation is absolute.
      linksSelector: 'ul li a[href$=".html"]:not([href^="/"]):not([href^="http"])',
      // "{title} - 小说在线阅读 - {author} - 努努书坊"
      authorSourceRegex: /<title>[^<]*?-\s*([^<-]+?)\s*-\s*努努书坊/,
    },
    content: {
      bodySelector: "#neirong",
      nextLinkSelector: "a#BookNext",
      nextLinkTextMatch: /下一章/,
      // "{novel} - 正文 第一章 丑闻 by {author} - 努努书坊 - 小说在线阅读"
      chapterTitleSourceRegex: /\s-\s(?:正文\s*)?(.+?)\sby\s/,
    },
    siteName: "努努书坊",
    elementBlacklist: DEFAULT_ELEMENT_BLACKLIST,
    fetchIntervalBase: 1000,
    fetchJitterRange: 600,
  },
  {
    id: "ixdzs",
    hostnamePattern: /(^|\.)ixdzs\.tw$/,
    // Plain requests are refused (403); pages load in a normal tab.
    requiresTabFetch: true,
    sampleUrls: {
      toc: "https://ixdzs.tw/read/586712/",
      firstChapter: "https://ixdzs.tw/read/586712/p1.html",
    },
    toc: {
      titleSelector: 'meta[property="og:title"]',
      titleAttr: "content",
      coverSelector: 'meta[property="og:image"]',
      coverAttr: "content",
      linksSelector: 'a[href*="/p"][href$=".html"]',
      // The index shows the latest chapters and a sample; walk from chapter 1.
      firstChapterSelector: 'a[href$="/p1.html"]',
      firstChapterTextMatch: /立即閱讀/,
      authorSourceRegex: /"author"[^}]*"name":"([^"]+)"/,
    },
    content: {
      bodySelector: "article.page-content section",
      nextLinkSelector: 'a[href$=".html"]',
      nextLinkTextMatch: /^\s*下一章/,
      // "第1章 她該清醒了_{novel}_繁體免費線上看-愛下電子書"
      chapterTitleSourceRegex: /^([^_]+)_/,
    },
    siteName: "愛下電子書",
    elementBlacklist: DEFAULT_ELEMENT_BLACKLIST,
    fetchIntervalBase: 1200,
    fetchJitterRange: 800,
  },
  {
    id: "mintteanovel",
    hostnamePattern: /(^|\.)mintteanovel\.com$/,
    sampleUrls: {
      toc: "https://mintteanovel.com/truyen/acid/",
      firstChapter: "https://mintteanovel.com/truyen/acid/chuong-01/",
    },
    toc: {
      titleSelector: 'meta[property="og:title"]',
      titleAttr: "content",
      coverSelector: 'meta[property="og:image"]',
      coverAttr: "content",
      linksSelector: 'a[href*="/chuong-"]',
      // The index is paginated newest-first; walk from "Từ đầu" (from the start).
      firstChapterSelector: 'a[href*="/chuong-"]',
      firstChapterTextMatch: /^\s*Từ đầu\s*$/i,
      authorSourceRegex: /\/tac-gia\/[^"]*"[^>]*>([^<]+)</,
    },
    content: {
      bodySelector: "#chapter-content",
      nextLinkSelector: 'a[href*="/chuong-"]',
      nextLinkTextMatch: /^\s*Sau\s*$/i,
      // "Chương đã bị khóa": the chapter is locked for signed-out readers.
      lockedTextMatch: /Chương đã bị khóa/i,
    },
    siteName: "Minttea Novel",
    elementBlacklist: DEFAULT_ELEMENT_BLACKLIST,
    fetchIntervalBase: 1000,
    fetchJitterRange: 600,
  },
  {
    id: "empirenovel",
    hostnamePattern: /(^|\.)empirenovel\.com$/,
    sampleUrls: {
      toc: "https://www.empirenovel.com/novel/this-dungeon-grew-mushrooms",
      firstChapter: "https://www.empirenovel.com/novel/this-dungeon-grew-mushrooms/1",
    },
    toc: {
      titleSelector: "h1",
      coverSelector: 'meta[property="og:image"]',
      coverAttr: "content",
      linksSelector: "a.chapter_link",
      // The index is paginated newest-first; walk from "First Chapter".
      firstChapterSelector: "div.col-6 a",
      firstChapterTextMatch: /^\s*First Chapter/i,
      authorSourceRegex: /[Aa]uthor[\s\S]{0,200}?<a[^>]*>([^<]+)<\/a>/,
    },
    content: {
      bodySelector: "#read-novel",
      // The arrow is icon-only.
      nextLinkSelector: "a#chapter-right",
      nextLinkTextMatch: /^/,
      chapterTitleSelector: "h3",
    },
    siteName: "Empire Novel",
    elementBlacklist: DEFAULT_ELEMENT_BLACKLIST,
    fetchIntervalBase: 1000,
    fetchJitterRange: 600,
  },
  // ── Added 2026-11-18 ──────────────────────────────────────────────────
  fictioneerConfig("sabertoothtl", /(^|\.)sabertoothtl\.com$/, "SaberToothTL", {
    toc: "https://sabertoothtl.com/story/logging-out-is-too-hard/",
    firstChapter: "https://sabertoothtl.com/story/logging-out-is-too-hard/chapter-001/",
  }, { requiresTabFetch: true }),
  fictioneerConfig("starlightnovels", /(^|\.)starlightnovels\.club$/, "Starlight Novels", {
    toc: "https://starlightnovels.club/story/the-moon-that-connects-my-fate-to-you/",
    firstChapter: "https://starlightnovels.club/story/the-moon-that-connects-my-fate-to-you/chapter-1/",
  }),
  siteConfig({
    id: "innerchildreads",
    hostnamePattern: /(^|\.)inner-child-reads\.com$/,
    siteName: "Inner Child Reads",
    sampleUrls: {
      toc: "https://inner-child-reads.com/deus-ex-machina/",
      firstChapter: "https://inner-child-reads.com/deus-ex-machina-chapter-1/",
    },
    toc: {
      linksSelector: "ul.lcp_catlist li a",
      nextPageSelector: "ul.lcp_paginator a",
      nextPageTextMatch: /^\s*(»|>|next)/i,
    },
    content: { bodySelector: ".stp-protected", nextLinkSelector: 'a[rel="next"]', nextLinkTextMatch: /^/ },
  }),
  siteConfig({
    id: "dragontl",
    hostnamePattern: /(^|\.)dragontl\.net$/,
    siteName: "DragonTL",
    sampleUrls: {
      toc: "https://dragontl.net/story/into-the-sea/",
      firstChapter: "https://dragontl.net/into-the-sea/chapter-1-recognizing-the-path/",
    },
    // og:image is the site logo, not the novel's cover.
    toc: { coverSelector: "img.wp-post-image", coverAttr: "src", linksSelector: "ul.mbs_toc_list li a" },
    content: { bodySelector: ".mbs_posts_text" },
  }),
  siteConfig({
    id: "novgo",
    hostnamePattern: /(^|\.)novgo\.net$/,
    siteName: "NOVGO",
    sampleUrls: {
      toc: "https://novgo.net/emperors-domination.html",
      firstChapter: "https://novgo.net/emperors-domination/chapter-1-three-demon-master-1.html",
    },
    // The index lists 50 chapters per AJAX page; walking from chapter 1 is simpler.
    toc: { firstChapterSelector: "a", firstChapterTextMatch: /^\s*Read first/i },
    content: { bodySelector: "#chapter-content", nextLinkSelector: "a", nextLinkTextMatch: /^\s*Next Chapter/i },
  }),
  siteConfig({
    id: "noveljungle",
    hostnamePattern: /(^|\.)noveljungle\.com$/,
    siteName: "NovelJungle",
    requiresTabFetch: true,
    sampleUrls: {
      toc: "https://noveljungle.com/books/2442",
      firstChapter: "https://noveljungle.com/chapters/39555",
    },
    toc: { firstChapterSelector: "a", firstChapterTextMatch: /^\s*Start reading/i },
    content: { bodySelector: "div.space-y-5", nextLinkSelector: "a", nextLinkTextMatch: /^\s*Next/i },
  }),
  siteConfig({
    id: "ceavan",
    hostnamePattern: /(^|\.)ceavan\.com$/,
    siteName: "ceavan",
    // An Angular app: pages are empty until rendered in a tab.
    requiresTabFetch: true,
    preferTocDiscovery: true,
    sampleUrls: {
      toc: "https://ceavan.com/class-transfer",
      firstChapter: "https://ceavan.com/class-transfer/volume-1/chapter-0",
    },
    toc: { linksSelector: "ul > li > a.mat-mdc-tooltip-trigger" },
    content: { bodySelector: "div.content-container" },
    extraBlacklist: ["h3.path", "app-chapter-nav", "h2.centered-title"],
  }),
  siteConfig({
    id: "hangukhub",
    hostnamePattern: /(^|\.)hangukhub\.com$/,
    siteName: "HangukHub",
    sampleUrls: {
      toc: "https://hangukhub.com/series/regressing-and-becoming-a-farming-tycoon-in-america",
      firstChapter: "https://hangukhub.com/series/regressing-and-becoming-a-farming-tycoon-in-america/chapter-1",
    },
    toc: { firstChapterSelector: "a", firstChapterTextMatch: /^\s*Read First Chapter/i },
    content: { bodySelector: ".content-rendered", nextLinkSelector: "a", nextLinkTextMatch: /^\s*Next\s*$/i },
  }),
  siteConfig({
    id: "blumeverse",
    hostnamePattern: /(^|\.)blume-verse\.com$/,
    siteName: "BlumeVerse",
    sampleUrls: {
      toc: "https://blume-verse.com/series/love-recycling/",
      firstChapter: "https://blume-verse.com/love-recycling-1/",
    },
    // The chapter list is filled in by script; walk from the first chapter.
    toc: { coverSelector: ".thumb img", coverAttr: "src", firstChapterSelector: ".inepcx a", firstChapterTextMatch: /^\s*First Chapter/i },
    content: { bodySelector: ".epcontent", nextLinkSelector: 'a[rel="next"]', nextLinkTextMatch: /^/ },
  }),
  siteConfig({
    id: "skynovelvault",
    hostnamePattern: /(^|\.)skynovelvault\.com$/,
    siteName: "SkyNovel Vault",
    sampleUrls: {
      toc: "https://skynovelvault.com/category/cultivation/the-immortal-map-a-clans-rise/",
      firstChapter: "https://skynovelvault.com/chapter-1-gu-huan/",
    },
    toc: { firstChapterSelector: "a.sn-start-reading", firstChapterTextMatch: /^/ },
    content: { bodySelector: "#sn-chapter-content", nextLinkSelector: "a.sn-nav-next", nextLinkTextMatch: /^/ },
  }),
  siteConfig({
    id: "wntl",
    hostnamePattern: /(^|\.)wntl\.net$/,
    siteName: "WNTL",
    sampleUrls: {
      toc: "https://wntl.net/series/icors",
      firstChapter: "https://wntl.net/read/icors/1",
    },
    toc: { firstChapterSelector: "a", firstChapterTextMatch: /^\s*Read First Chapter/i },
    content: { bodySelector: ".markdown-content", nextLinkSelector: "a", nextLinkTextMatch: /^\s*Next Chapter/i },
  }),
  siteConfig({
    id: "deroxzone",
    hostnamePattern: /(^|\.)deroxzone\.com$/,
    siteName: "Derox Zone",
    sampleUrls: {
      toc: "https://deroxzone.com/serie/the-artist-who-paints-dungeon",
      firstChapter: "https://deroxzone.com/serie/the-artist-who-paints-dungeon/chapter-1",
    },
    // The index shows only the newest chapters; walk from chapter 1.
    toc: { firstChapterSuffix: "/chapter-1" },
    content: { bodySelector: "div.read-novela", nextLinkSelector: "a", nextLinkTextMatch: /^\s*Next\s*$/i },
  }),
  siteConfig({
    id: "valvrareteam",
    hostnamePattern: /(^|\.)valvrareteam\.net$/,
    siteName: "Valvrareteam",
    sampleUrls: {
      toc: "https://valvrareteam.net/truyen/trong-sinh-tu-tien-doi-thuong-7d592ef8",
      firstChapter: "https://valvrareteam.net/truyen/trong-sinh-tu-tien-doi-thuong-7d592ef8/chuong/chuong-1-tro-lai-thoi-thieu-nien-7d595450",
    },
    // The first <h1> is the site logo; og:title is "{Novel} Vietsub | ...".
    toc: { titleSelector: 'meta[property="og:title"]', titleAttr: "content", titleSuffixRegex: /\s*(Vietsub)?\s*\|.*$/, firstChapterSelector: "a", firstChapterTextMatch: /^\s*Chương đầu tiên/i },
    // Previous and next share a class; only "previous" carries this title.
    content: { bodySelector: ".chapter-content", nextLinkSelector: 'a.chapter-nav-btn:not([title*="trước"])', nextLinkTextMatch: /^/, chapterTitleSourceRegex: /^(.+?)\s+-\s+/ },
  }),
  siteConfig({
    id: "xswtw",
    hostnamePattern: /(^|\.)xsw\.tw$/,
    siteName: "台灣小說網",
    sampleUrls: {
      toc: "https://m.xsw.tw/1713745/",
      firstChapter: "https://m.xsw.tw/1713745/250143505.html",
    },
    toc: { firstChapterSelector: "a", firstChapterTextMatch: /^\s*開始閱讀/ },
    content: { bodySelector: "#nr1", nextLinkSelector: "a#pb_next", nextLinkTextMatch: /下一章/ },
  }),
  siteConfig({
    id: "uuread",
    hostnamePattern: /(^|\.)uuread\.tw$/,
    siteName: "uu看書",
    preferTocDiscovery: true,
    sampleUrls: {
      toc: "https://www.uuread.tw/1378603",
      firstChapter: "https://www.uuread.tw/chapter/1378603/56020.html",
    },
    toc: { titleSelector: 'meta[property="og:title"]', titleAttr: "content", linksSelector: "ul#newlist li a" },
    // Each chapter is split over two or more pages joined by "下一頁".
    content: { bodySelector: "#nr", nextLinkSelector: "a", nextLinkTextMatch: /^\s*下一章/, pageLinkTextMatch: /^下一頁$/, chapterTitleSourceRegex: /^[^_]*_([^_]+)_/ },
  }),
  siteConfig({
    id: "bllate",
    hostnamePattern: /(^|\.)bllate\.org$/,
    siteName: "Bllate",
    sampleUrls: {
      toc: "https://bllate.org/book/28979",
      firstChapter: "https://bllate.org/book/28979/3509061/ready_new",
    },
    toc: { firstChapterSelector: "a", firstChapterTextMatch: /^\s*Начать чтение/i },
    content: { bodySelector: ".reader-content", nextLinkSelector: "a.btn", nextLinkTextMatch: /^\s*Дальше/i, chapterTitleSourceRegex: /:\s*([^:]+)$/ },
    extraBlacklist: ["a.btn", "h1", ".reader-header"],
  }),
  siteConfig({
    id: "ladyhotcomb",
    hostnamePattern: /(^|\.)ladyhotcombtranslations\.com$/,
    siteName: "Ladyhotcomb Translations",
    preferTocDiscovery: true,
    sampleUrls: {
      // The novel page shows only the latest ten chapters; its category archive lists them all.
      toc: "https://ladyhotcombtranslations.com/category/novels/rise-of-the-othergod-apostle-not-a-cult-leader-but-a-serf/",
      firstChapter: "https://ladyhotcombtranslations.com/novels/rise-of-the-othergod-apostle-not-a-cult-leader-but-a-serf/196-gg/",
    },
    toc: {
      titleSelector: "title",
      titleSuffixRegex: /\s*-\s*Ladyhotcomb Translations\s*$/i,
      linksSelector: "article h2 a",
      nextPageSelector: "a.next.page-numbers",
      nextPageTextMatch: /^\s*Next/i,
      // The archive is newest first; the number in the URL gives reading order.
      chapterIndexFromHrefRegex: /\/(\d+)-[^/]*\/?$/,
    },
    content: { bodySelector: ".entry-content", nextLinkSelector: "a", nextLinkTextMatch: /^\s*Next/i },
  }),
  siteConfig({
    id: "penguinsquad",
    hostnamePattern: /(^|\.)penguin-squad\.com$/,
    siteName: "Penguin Squad",
    sampleUrls: {
      toc: "https://penguin-squad.com/novels/a-space-marine-gets-a-status-window",
      firstChapter: "https://penguin-squad.com/novels/a-space-marine-gets-a-status-window/prologue",
    },
    toc: { firstChapterSelector: "a", firstChapterTextMatch: /^\s*Read\s*$/i },
    content: { bodySelector: "article", nextLinkSelector: 'a[aria-label^="Next chapter"]', nextLinkTextMatch: /^/ },
    extraBlacklist: ["header", "div.fixed"],
  }),
  fancyPlatformConfig("fancytl", /(^|\.)fancytl\.com$/, "FancyTL", "https://fancytl.com"),
  // Same platform and book ids as FancyTL, behind Cloudflare.
  fancyPlatformConfig("botitranslation", /(^|\.)botitranslation\.com$/, "Boti Translation", "https://www.botitranslation.com"),
  siteConfig({
    id: "theladylovesreading",
    hostnamePattern: /(^|\.)theladylovesreading\.com$/,
    siteName: "The Lady Loves Reading",
    preferTocDiscovery: true,
    sampleUrls: {
      // A book's "Read Now" page is a paged archive of its chapter posts.
      toc: "https://theladylovesreading.com/series/legend-of-the-female-general-rebirth-of-the-female-general-the-song-of-splendid-moon-%e9%87%8d%e7%94%9f%e4%b9%8b%e5%a5%b3%e5%b0%87%e6%98%9f%ef%bc%88%e9%8c%a6%e6%9c%88%e5%a6%82%e6%ad%8c/",
    },
    toc: {
      titleSelector: "title",
      titleSuffixRegex: /\s*-\s*The Lady Loves Reading\s*$/i,
      linksSelector: "h2.entry-title a",
      nextPageSelector: "a.next.page-numbers",
      nextPageTextMatch: /^/,
      chapterIndexFromHrefRegex: /-chapter-(\d+)\/?$/,
    },
    content: { bodySelector: ".entry-content" },
  }),
  siteConfig({
    id: "sakuraze",
    hostnamePattern: /(^|\.)sakuraze\.vercel\.app$/,
    siteName: "Sakuraze",
    // A script-rendered reader whose "Next" is a button, not a link.
    requiresTabFetch: true,
    preferTocDiscovery: true,
    sampleUrls: {
      toc: "https://sakuraze.vercel.app/novel/the-forgotten-field",
      firstChapter: "https://sakuraze.vercel.app/novel/the-forgotten-field/chapter/1",
    },
    toc: {
      linksSelector: 'a[href*="/chapter/"]',
      chapterIndexFromHrefRegex: /\/chapter\/(\d+)\/?$/,
      // The index shows only the newest chapters; every chapter is at /chapter/N.
      numberedChapterPath: "/chapter/",
    },
    // Premium chapters show a preview outside this container, so they are reported, not saved.
    content: { bodySelector: ".chapter-effects-scope", allowContentFallback: false, chapterTitleSelector: "h1" },
  }),
  siteConfig({
    id: "novelfull",
    hostnamePattern: /(^|\.)novelfull\.com$/,
    siteName: "NovelFull",
    preferTocDiscovery: true,
    sampleUrls: {
      toc: "https://novelfull.com/the-mech-touch.html",
      firstChapter: "https://novelfull.com/the-mech-touch/chapter-1-age-of-mechs.html",
    },
    // 50 chapters per index page, oldest first.
    toc: { titleSelector: "h3.title", coverSelector: ".book img", coverAttr: "src", linksSelector: "#list-chapter ul.list-chapter li a", nextPageSelector: "li.next a", nextPageTextMatch: /^/ },
    content: { bodySelector: "#chapter-content", nextLinkSelector: "a#next_chap", nextLinkTextMatch: /^/ },
  }),
  siteConfig({
    id: "freewebnovel",
    hostnamePattern: /(^|\.)freewebnovel\.com$/,
    siteName: "Free Web Novel",
    sampleUrls: {
      toc: "https://freewebnovel.com/novel/the-innkeeper",
      firstChapter: "https://freewebnovel.com/novel/the-innkeeper/chapter-1",
    },
    toc: { firstChapterSelector: "a", firstChapterTextMatch: /^\s*Read first/i },
    content: { bodySelector: "#article", nextLinkSelector: "a", nextLinkTextMatch: /^\s*Next Chapter/i },
  }),
  siteConfig({
    id: "easternwordsmith",
    hostnamePattern: /(^|\.)easternwordsmith\.com$/,
    siteName: "Eastern WordSmith",
    preferTocDiscovery: true,
    sampleUrls: {
      toc: "https://easternwordsmith.com/novel/Jack-of-All-Trades,%20Party%20of%20None",
      firstChapter: "https://easternwordsmith.com/chapter/10492",
    },
    toc: {
      titleSelector: "title",
      // Free chapters only; early-access ones are separate lock links. Listed newest first as "C12 : Title".
      linksSelector: "div.col-7 > a[href*='/chapter/']",
      chapterIndexFromTextRegex: /^C(\d+)\b/,
    },
    content: { bodySelector: "section#CS" },
  }),
  siteConfig({
    id: "xtruyen",
    hostnamePattern: /(^|\.)xtruyen\.vn$/,
    siteName: "XTruyện",
    // The served HTML holds only a short preview; the full text is rendered by script.
    requiresTabFetch: true,
    sampleUrls: {
      toc: "https://xtruyen.vn/truyen/thieu-gia-bi-bo-roi/",
      firstChapter: "https://xtruyen.vn/truyen/thieu-gia-bi-bo-roi/chuong-1/",
    },
    toc: { firstChapterSelector: "a", firstChapterTextMatch: /^\s*Chương đầu/i },
    content: { bodySelector: ".reading-content .text-left", nextLinkSelector: "a.next_page", nextLinkTextMatch: /^/ },
  }),
  siteConfig({
    id: "webnovel",
    hostnamePattern: /(^|\.)webnovel\.com$/,
    siteName: "WebNovel",
    preferTocDiscovery: true,
    sampleUrls: {
      toc: "https://www.webnovel.com/book/slay-demons-and-extract-abilities_37049045308187805/catalog",
      firstChapter: "https://www.webnovel.com/book/slay-demons-and-extract-abilities_37049045308187805/chapter-1-survival_99727107348816631",
    },
    // Paid chapters carry a lock icon and are left out, so previews are never saved as chapters.
    toc: { linksSelector: "ol.content-list li a:not(:has(svg))" },
    content: { bodySelector: ".cha-words", chapterTitleSourceRegex: /\s-\s(.+?)\s-\sWebNovel$/ },
  }),
];

// Shared defaults for the smaller sites: the title from <h1>, the cover from
// og:image, and the usual pacing. Each entry only states what differs.
function siteConfig({ toc = {}, content = {}, extraBlacklist = [], ...rest }) {
  return {
    toc: { titleSelector: "h1", coverSelector: 'meta[property="og:image"]', coverAttr: "content", ...toc },
    content,
    elementBlacklist: [...DEFAULT_ELEMENT_BLACKLIST, ...extraBlacklist],
    fetchIntervalBase: 1000,
    fetchJitterRange: 600,
    ...rest,
  };
}

// WordPress sites on the Fictioneer theme (same markup as Peach Puff).
// Scheduled chapters (class "_future") are listed but not yet readable.
function fictioneerConfig(id, hostnamePattern, siteName, sampleUrls, extra = {}) {
  return siteConfig({
    id,
    hostnamePattern,
    siteName,
    sampleUrls,
    toc: {
      titleSelector: "h1",
      coverSelector: ".story__thumbnail img",
      coverAttr: "src",
      linksSelector: "li.chapter-group__list-item:not(._future) > .chapter-group__list-item-link",
    },
    content: { bodySelector: ".chapter-formatting", nextLinkSelector: "a._navigation._next", nextLinkTextMatch: /^\s*Next/i },
    ...extra,
  });
}

// FancyTL and Boti Translation run on one script-rendered platform: book
// pages list chapters 100 at a time, so walk from the first table row.
function fancyPlatformConfig(id, hostnamePattern, siteName, origin) {
  return siteConfig({
    id,
    hostnamePattern,
    siteName,
    requiresTabFetch: true,
    sampleUrls: {
      toc: `${origin}/book/12884-son-of-the-hero-king`,
      firstChapter: `${origin}/chapter/1435392-book-1-vol-1-ch-1-an-intriguing-order`,
    },
    toc: { titleSelector: "title", coverSelector: ".cover img", coverAttr: "src", firstChapterSelector: "tr > td > a.title-color", firstChapterTextMatch: /^/ },
    content: { bodySelector: "#chapterContent", nextLinkSelector: "a#nextBtn", nextLinkTextMatch: /^/ },
  });
}

function jormuntlConfig(id, hostnamePattern, siteName, sampleUrls) {
  return {
    id,
    hostnamePattern,
    sampleUrls,
    toc: {
      titleSelector: "h1",
      coverSelector: "img.wp-post-image",
      coverAttr: "src",
      linksSelector: "#novel-toc-list a",
      authorSourceRegex: /"author"[^}]*"name":"([^"]+)"/,
    },
    content: {
      bodySelector: ".chapter-content",
      nextLinkSelector: "a.btn-secondary",
      nextLinkTextMatch: /^\s*Next/i,
    },
    siteName,
    elementBlacklist: DEFAULT_ELEMENT_BLACKLIST,
    fetchIntervalBase: 1000,
    fetchJitterRange: 600,
  };
}

// Best-effort fallback for sites with no dedicated entry above. Content is
// located via ContentDetector's auto-detection (bodySelector: null) instead
// of a hand-picked selector, and "next chapter" discovery matches any link
// whose text starts with "next" - much less precise than a real config, but
// lets unlisted sites work at all via the "First chapter URL" field. There's
// no reliable generic way to discover a full chapter list from a TOC page,
// so this doesn't support the "Novel index URL only" discovery path.
function buildGenericConfig(hostname) {
  return {
    id: "generic",
    hostnamePattern: null,
    toc: {
      titleSelector: "title",
      coverSelector: 'meta[property="og:image"]',
      coverAttr: "content",
      linksSelector: null,
      // Where a story starts, in the languages of the sites people ask for.
      startLinkTextMatch: /^\s*(start reading|read (the )?first( chapter)?|first chapter|begin reading|read now|chapter 0*1\b|ch\.?\s*0*1\b|開始閱讀|开始阅读|從頭閱讀|第一章|第0*1章|第0*1話|最初から読む|첫\s*화|1\s*화|đọc từ đầu|chương đầu|chương 0*1\b|начать чтение|читать с начала|глава 1\b|leer desde el (inicio|principio)|capítulo 0*1\b|commencer la lecture|chapitre 0*1\b|baca dari awal|bab 0*1\b)/i,
    },
    content: {
      bodySelector: null,
      // Known reader containers are tried before paragraph scoring, which
      // can be misled by long comment sections.
      bodyCandidates: [
        'div[id^="viewer"]', ".viewer_contents", ".theme-novel-content", ".novel-content", "#novel_content",
        "#chapter-content", ".chapter-content", "#chr-content", ".reading-content",
      ],
      nextLinkSelector: "a",
      // English plus the common Korean, Chinese, Japanese, and European labels.
      nextLinkTextMatch: /^\s*(next\b|다음\s*화|다음|下一[章页頁话話]|次の?[話章へ]|siguiente|suivant|próximo|weiter|chương (sau|tiếp)|tiếp theo|дальше|следующая|selanjutnya|berikutnya|ถัดไป|sonraki)/i,
      // Icon-only next buttons have no text to match.
      nextLinkFallbackSelector: 'a[rel~="next"], #next_move, #goNextBtn, .btn-next, a.next, .next > a, a.next-chapter, #next_chap',
    },
    siteName: hostname,
    elementBlacklist: DEFAULT_ELEMENT_BLACKLIST,
    // Nobody has checked how much an unlisted site tolerates, so start slower
    // than supported sites; adaptive pacing speeds up only after clean pages.
    fetchIntervalBase: 2500,
    fetchJitterRange: 1500,
  };
}

// Returns the matching site config for a URL, falling back to a generic
// best-effort config (see buildGenericConfig) if none is configured.
export function getConfigForUrl(url) {
  const hostname = new URL(url).hostname;
  return SITE_CONFIGS.find((c) => c.hostnamePattern.test(hostname)) || buildGenericConfig(hostname);
}
