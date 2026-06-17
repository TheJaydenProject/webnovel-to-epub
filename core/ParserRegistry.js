// Declarative per-site scraping configuration. To support a new site, add
// an entry here - no other code should need to change.
export const SITE_CONFIGS = [
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
      "script",
      "style",
      "noscript",
      "iframe",
      "ins",
      // Empty placeholder for Wattpad's text-to-speech widget.
      ".trinityAudioPlaceholder",
      '[class*="ad-"]',
      '[class*="advert"]',
    ],
    fetchIntervalBase: 800,
    fetchJitterRange: 600,
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
      "script",
      "style",
      "noscript",
      "iframe",
      "ins",
      // Inline "comment on this paragraph" buttons/badges.
      "button",
      '[class*="ad-"]',
      '[class*="advert"]',
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
      "script",
      "style",
      "noscript",
      "iframe",
      "ins",
      '[class*="ad-"]',
      '[class*="advert"]',
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
      titleSuffixRegex: /\s*Novel\s*\|\s*Read Online on Novel Arrow\s*$/i,
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
      "script",
      "style",
      "noscript",
      "iframe",
      "ins",
      // The chapter title heading - already shown via the EPUB's own
      // chapter title, so drop it from the body to avoid duplication.
      "h2",
      '[class*="ad-"]',
      '[class*="advert"]',
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
    elementBlacklist: [
      "script",
      "style",
      "noscript",
      "iframe",
      "ins",
      '[class*="ad-"]',
      '[class*="advert"]',
    ],
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
    elementBlacklist: [
      "script",
      "style",
      "noscript",
      "iframe",
      "ins",
      '[class*="ad-"]',
      '[class*="advert"]',
    ],
    fetchIntervalBase: 800,
    fetchJitterRange: 600,
  },
  {
    id: "novelfire",
    hostnamePattern: /(^|\.)novelfire\.net$/,
    sampleUrls: {
      toc: "https://novelfire.net/book/unclassified-zero-and-still-standing",
      firstChapter: "https://novelfire.net/book/unclassified-zero-and-still-standing/chapter-1",
    },
    toc: {
      titleSelector: 'meta[property="og:title"]',
      titleAttr: "content",
      // The og:title has a " - Novel Fire" suffix - strip it so chapter-title
      // extraction can match the novel title prefix.
      titleSuffixRegex: /\s*-\s*Novel Fire\s*$/i,
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
    siteName: "Novel Fire",
    elementBlacklist: [
      "script",
      "style",
      "noscript",
      "iframe",
      "ins",
      // In-content ad placeholders.
      ".nf-ads",
      '[class*="ad-"]',
      '[class*="advert"]',
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
    elementBlacklist: [
      "script",
      "style",
      "noscript",
      "iframe",
      "ins",
      '[class*="ad-"]',
      '[class*="advert"]',
    ],
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
    elementBlacklist: [
      "script",
      "style",
      "noscript",
      "iframe",
      "ins",
      '[class*="ad-"]',
      '[class*="advert"]',
    ],
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
    elementBlacklist: [
      "script",
      "style",
      "noscript",
      "iframe",
      "ins",
      '[class*="ad-"]',
      '[class*="advert"]',
    ],
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
    elementBlacklist: [
      "script",
      "style",
      "noscript",
      "iframe",
      "ins",
      '[class*="ad-"]',
      '[class*="advert"]',
    ],
    fetchIntervalBase: 800,
    fetchJitterRange: 600,
  },
  {
    id: "novelverse",
    hostnamePattern: /(^|\.)novelverse\.online$/,
    sampleUrls: {
      toc: "https://novelverse.online/novel/the-legend-of-the-northern-blade/",
      firstChapter: "https://novelverse.online/chapter/the-legend-of-the-northern-blade/lnb-chapter-1",
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
    elementBlacklist: [
      "script",
      "style",
      "noscript",
      "iframe",
      "ins",
      '[class*="ad-"]',
      '[class*="advert"]',
    ],
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
    elementBlacklist: [
      "script",
      "style",
      "noscript",
      "iframe",
      "ins",
      '[class*="ad-"]',
      '[class*="advert"]',
    ],
    fetchIntervalBase: 800,
    fetchJitterRange: 600,
  },
  {
    id: "dreamy-translations",
    hostnamePattern: /(^|\.)dreamy-translations\.com$/,
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
      coverSelector: 'meta[property="og:image"]',
      coverAttr: "content",
      linksSelector: "a[data-chapter-index]",
      // The author name isn't in a plain DOM element on this site - it's
      // embedded in a Next.js RSC data blob as escaped JSON. Best effort
      // regex extraction against the raw page source, with a graceful
      // fallback if the markup changes.
      authorSourceRegex: /author\\":\\"([^"\\]*)\\"/,
    },
    content: {
      bodySelector: "article.chapter-content",
      // Used for "first chapter URL" fallback discovery: candidate links
      // are matched against this selector, then the one whose text starts
      // with "Next" is followed to find the next chapter.
      nextLinkSelector: 'a[href*="/chapter/"]',
      nextLinkTextMatch: /^\s*next/i,
    },
    siteName: "Dreamy Translations",
    elementBlacklist: [
      "script",
      "style",
      "noscript",
      "iframe",
      "ins",
      '[class*="ad-"]',
      '[class*="advert"]',
    ],
    fetchIntervalBase: 800,
    fetchJitterRange: 600,
  },
];

// Returns the matching site config for a URL, or null if none configured.
export function getConfigForUrl(url) {
  const hostname = new URL(url).hostname;
  return SITE_CONFIGS.find((c) => c.hostnamePattern.test(hostname)) || null;
}
