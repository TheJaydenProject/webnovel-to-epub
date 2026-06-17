# Web Novel to EPUB

A Firefox extension (Manifest V3) that compiles chapters from
web novel sites — including images and cover art — into a single, compressed
EPUB file.

<p align="center">
  <a href="https://github.com/TheJaydenProject/webnovel-to-epub/issues/new?template=bug_report.md">Report a Bug</a>
  &nbsp;·&nbsp;
  <a href="https://github.com/TheJaydenProject/webnovel-to-epub/issues/new?template=feature_request.md">Request a Feature</a>
  &nbsp;·&nbsp;
  <a href="https://github.com/TheJaydenProject/webnovel-to-epub/issues/new?template=site_request.md">Request a Site</a>
</p>

## Features

- Reads a novel's table-of-contents page to discover chapters, title, author,
  and cover image automatically
- Fallback "next chapter" link-walking for sites where the TOC doesn't list
  every chapter
- Search chapters by name or number, select a range, or pick all/none before
  compiling
- Bundles cover art and inline images into the EPUB
- EPUB output is DEFLATE-compressed (level 9) for a smaller file size
- **Use browser tab for fetching** (on by default) — loads each page in a real
  background tab using your logged-in browser session, so paywalled or
  Cloudflare-protected chapters work the same way they do when you read them
  normally
- **Auto-compile** (on by default) — compiles the EPUB immediately after
  chapters finish loading, skipping the manual "Compile" step
- Stop button cancels a run mid-way and compiles whatever was fetched so far
- WuxiaWorld API integration — auto-fills your API token from an open
  wuxiaworld.com tab and uses WuxiaWorld's own API to see exactly which
  chapters your account can access

## Installation

1. Go to `about:debugging` → "This Firefox" → "Load Temporary Add-on..."
2. Select `manifest.json` from this folder

## Usage

1. **Open the novel's table-of-contents page** in your browser (the series or
   index page, not a chapter page)
2. **Click the extension icon** — the TOC URL is pre-filled automatically
3. *(Optional)* Fill in a **First chapter URL** if the index page doesn't list
   every chapter — the extension will walk "Next chapter" links from there to
   discover the full list
4. Click **Load chapters**
5. Review the chapter list — use **Select all / Select none**, the **From / To**
   range fields, or the **search box** to pick exactly what you want
6. Click **Compile EPUB** (or let auto-compile do it for you)

The EPUB downloads automatically when compilation finishes.

### Tips

- **Sites behind Cloudflare or a login wall** — "Use browser tab for fetching"
  is on by default and handles these automatically. Make sure you're logged in
  to the site in the same browser before loading.
- **Sites with incomplete TOC pages** — fill in the First chapter URL. The
  extension follows "Next chapter" links through the whole series from there.
- **WuxiaWorld** — the extension auto-fills your API token from an open
  wuxiaworld.com tab. No manual steps needed as long as you're logged in.
- **Stopping early** — click Stop at any point. The extension compiles an EPUB
  from the chapters it has already fetched.

### Advanced options

| Option | Default | Description |
|--------|---------|-------------|
| Use browser tab for fetching | On | Loads pages in a background tab using your real browser session — required for Cloudflare-protected or login-gated sites |
| Auto-compile after loading | On | Skips the manual Compile step |
| WuxiaWorld API token | — | Auto-filled from an open wuxiaworld.com tab; only needed for wuxiaworld.com |

## Supported Sites

<details>
<summary>14 verified sites — click to expand</summary>

Sites are configured declaratively in `core/ParserRegistry.js`. All entries
below have been tested end-to-end and produced a working EPUB.

- [wattpad.com](https://www.wattpad.com) - last verified 2026-06-15
- [royalroad.com](https://www.royalroad.com) - last verified 2026-06-15
- [scribblehub.com](https://www.scribblehub.com) - last verified 2026-06-15
- [wuxiaworld.com](https://www.wuxiaworld.com) - last verified 2026-06-14
- [novelbin.com](https://novelbin.com) / [novelbin.me](https://novelbin.me) - last verified 2026-06-15
- [novelbuddy.com](https://novelbuddy.com) - last verified 2026-06-15
- [novelfire.net](https://novelfire.net) - last verified 2026-06-15
- [novelarrow.com](https://novelarrow.com) - last verified 2026-06-15
- [novelverse.online](https://novelverse.online) - last verified 2026-06-15
- [ranovel.com](https://ranovel.com) - last verified 2026-06-15
- [wetriedtls.com](https://wetriedtls.com) - last verified 2026-06-15
- [dreamy-translations.com](https://dreamy-translations.com) - last verified 2026-06-14
- [dreambigtl.com](https://www.dreambigtl.com) - last verified 2026-06-15
- [fenrirealm.com](https://fenrirealm.com) - last verified 2026-06-15

</details>

## Requesting a New Site

[Open a site request](https://github.com/TheJaydenProject/webnovel-to-epub/issues/new?template=site_request.md) and include:

- The novel's index/table-of-contents URL
- A link to a sample chapter page
- Whether the site requires login to read any chapters

## Reporting a Bug

[Open a bug report](https://github.com/TheJaydenProject/webnovel-to-epub/issues/new?template=bug_report.md) and include:

- The novel/chapter URL you were loading
- What you expected vs. what happened
- Any messages from the Console panel in the extension UI
- Your browser and version
