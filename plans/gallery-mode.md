# Gallery scraping implementation

## Phase 0: verified APIs and current behavior

- Firefox directory input: `<input type="file" webkitdirectory multiple>`, `input.files`, `file.webkitRelativePath`, `file.arrayBuffer()`. Folder access is read-only and must be selected again after reopening. [MDN](https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement/webkitdirectory)
- Existing JSZip 3.10.1: `JSZip.loadAsync(arrayBuffer)`, `zip.file(path)`, `entry.internalStream("string").on(...).resume()`. Pause metadata streams at a size limit. [JSZip streams](https://stuk.github.io/jszip/documentation/api_zipobject/internal_stream.html)
- Existing `browser.downloads.download` supports a relative filename, not an arbitrary absolute output path. Keep existing download-completion handling. [Mozilla](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/downloads/download)
- Live Dreamy `/series` renders its full gallery as novel links with `h3` titles. Novel pages expose explicit `Free (N)` and `Premium (N)` buttons and `a[data-chapter-index]` links. Gallery badges alone are not proof of zero premium chapters.

## Phase 1: local matching and site parsing

Read EPUB container and OPF metadata only, one file at a time. Match normalized full titles, filenames, or canonical Dreamy source URLs, never fuzzy substrings. Bound archive size and decompressed metadata. Report filename-only fallback for unreadable archives. Add source URL to newly generated EPUB metadata for renamed-file matching. Parse only validated Dreamy novel URLs. Test punctuation, namespaced metadata, duplicate links, corrupted archives, and untrusted URLs.

## Phase 2: rendered Dreamy pages and filters

Use existing background-tab scripting pattern, waiting for actual gallery cards, chapter lists, or chapter content. Missing premium counts fail closed for free-only mode. Scan candidates sequentially with existing request delays. Recheck the free-only rule immediately before compiling a gallery job, including on retry. Do not purchase/unlock content. Test zero, positive, unknown counts, timeouts, and strict chapter-body detection.

## Phase 3: Gallery mode and queue integration

Add a third mode, gallery URL, folder picker, checked Hiatus and free-only toggles, Scan & download button, stop control, and per-novel result list. Default supported gallery is Dreamy; reject unsupported URLs clearly. Keep local file contents in memory only and never upload them. Existing queue handles chapter/image failures, saving, retry, and pause. Auto-run only jobs added by this scan, not unrelated waiting entries. A cancelled scan does not auto-start partial results. Test cancellation, queue isolation, persisted filter requirements, and old saved queues.

## Phase 4: verification and packaging

Additional requested filter: **Only completed novels**, off by default. Live Dreamy exposes a Completed gallery toggle (116 novels during inspection), rather than a reliable novel-page status label. Verify activation, wait for stable filtered cards, intersect by canonical URL, and recheck membership before running each saved gallery job. Do not infer completion from free chapter counts. Cover missing filter, unknown status, toggles, queue persistence, and changed membership with tests.

Run current queue and compile regressions, native browser fixtures with authored gallery HTML and generated EPUBs, and a rendered dashboard smoke test. Do not download the live gallery during verification. Bump release version and produce a ZIP matching the established runtime file layout; run Firefox lint and disclose remaining warnings.

## Verification completed

- Queue and compile regression suites pass, including completion-filter persistence, changed status before download, and missing-filter failure handling.
- Browser gallery fixture: 38 checks pass using real generated EPUBs and authored DOM fixtures.
- Production dashboard with mocked extension APIs passes scan, all filters, EPUB generation, download confirmation, and viewport overflow checks at desktop and 390px widths. Reviewed both layouts visually.
- Live Dreamy gallery and completion toggle inspected. No full live gallery download was performed.
- Firefox lint: zero errors, zero notices, three existing warnings (desktop/Android minimum-version compatibility declarations and bundled JSZip's Function constructor).
- Rebuilt 0.5.0 ZIP with completed-only feature, root manifest, and 22 runtime files. Archive integrity and every file verified against the workspace. Tests and development files excluded.
