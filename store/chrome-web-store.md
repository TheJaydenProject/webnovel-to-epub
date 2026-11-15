# Chrome Web Store submission — Web Novel to EPUB

Same folder ships to both stores. The repository root is the uploadable
extension root (`manifest.json` is at the top level).

## Product details

- **Name:** Web Novel to EPUB
- **Category:** Productivity
- **Language:** English

**Single purpose (required field):**

> Web Novel to EPUB saves chapters from a web novel site, which the user is
> already able to read in their browser, into a single EPUB file on their
> computer. It does not modify pages, block content, or manage browsing data.

**Short description (132 char limit):**

> Save web novel chapters into a single EPUB file, cover art and images included. Everything stays on your PC.

**Detailed description:** reuse `README.md` — the About, Features and How It
Works sections. Drop the Firefox-only install steps; see the README update.

## Permission justifications

| Permission | Justification to paste into the dashboard |
| --- | --- |
| `storage` | Stores the compile queue (so a long queue resumes after the browser restarts) and the user's output/formatting settings. No page content is retained after compilation. |
| `downloads` | The extension's entire output is a `.epub` file. `downloads.download` saves that file to the user's download folder; `downloads.onChanged` reports whether it actually finished. |
| `tabs` | Opens the dashboard tab from the toolbar button, and follows the tab it created to report chapter progress and close it when done. |
| `scripting` | Injects a reader into the chapter pages the user queued, to extract the chapter text and image URLs. It only runs on pages the user explicitly added. |
| `host_permissions: <all_urls>` | Web novel sites are user-chosen and change constantly, so they cannot be enumerated in advance. Site access is used only on queued pages. |

`<all_urls>` will draw reviewer attention. The detailed description should state
plainly that access is limited to queued pages and that nothing is uploaded.

## Data usage disclosures

- **Does the extension collect user data?** No. No network requests other than
  fetching the novel pages the user queued; no analytics, no remote endpoints.
  `PRIVACY.md` in this repository is the full policy.
- **Certify:** not sold; not used for unrelated purposes; not used for
  creditworthiness.

## Privacy policy URL

`PRIVACY.md` needs a public URL before submission:

1. GitHub Pages on this repo, or
2. `https://github.com/TheJaydenProject/webnovel-to-epub/blob/main/PRIVACY.md`

## Store listing assets

- Icon 128×128: `icons/icon-128.png` ✅ present.
- Screenshots at 1280×800 or 640×400: the dashboard with a populated queue, the
  gallery/library view, and a completed book list.
- Small promo tile 440×280 (optional).

## Submission checklist

- [ ] `manifest_version` 3 ✅
- [ ] `minimum_chrome_version` 121 — set in `manifest.json`
- [ ] No remotely hosted code — `jszip` is vendored at `ui/vendor/jszip.min.js` ✅
- [ ] Do not ship the older release zips or `source-code.zip` inside the upload
      (the packaging step below excludes them; they would waste reviewer time
      and bloat the archive)
- [ ] Version bumped above whatever is live on AMO
- [ ] Privacy policy URL live and public
- [ ] `browser_specific_settings` left in place: Chrome ignores it with a
      warning. Strip only if a reviewer asks.

## Packaging

```
dist/webnovel-to-epub-<version>.zip
└── manifest.json          ← at the archive root
    background/
    core/
    icons/
    ui/
    browser-shim.js
    LICENSE
    PRIVACY.md
    README.md
```

Excluded: `.git/`, `.claude/`, `plans/`, `tests/`, `images/`, and every `*.zip`
already in the repo root.

`jszip.js` at the repository root is a legacy duplicate of
`ui/vendor/jszip.min.js` and is not loaded by any page. It is excluded from the
package; consider deleting it from the repo separately.
