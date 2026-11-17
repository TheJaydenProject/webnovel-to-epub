# Privacy Policy — Web Novel to EPUB

**Effective date:** November 15, 2026

Web Novel to EPUB is an open-source browser extension that compiles chapters you
are already able to read into a single EPUB file on your own computer.

## Data collection

**The extension collects nothing and transmits nothing.** There is no analytics,
no telemetry, no crash reporting, and no remote endpoint of any kind. The
extension does not contact any server other than the novel sites you ask it to
read.

## What is processed, and where

| Data | Where it goes | Why |
| --- | --- | --- |
| Chapter text and images | Read from the site in your browser, written into the EPUB in memory | Building the book |
| EPUB file | Your browser's configured download folder | Delivering the finished file |
| Queue state and settings | `storage.local` on your device | Resuming a queue, remembering options |
| Per-site reading pace and page layout (site name, delay, where the chapter text sits) | `storage.local` on your device | Reading each site politely and correctly on later visits |
| Selected library folder | Read-only, in the browser tab you opened | Scanning for existing EPUBs |

Nothing above leaves your device. No copy is sent to the developer or to any
third party.

## Permissions and why they are requested

- **`storage`** — keep the download queue and your settings between sessions.
- **`downloads`** — save the compiled `.epub` to your machine.
- **`tabs`** — open the dashboard tab and follow the tab the extension created so
  progress can be reported.
- **`scripting`** — read chapter content from pages you have asked it to compile.
- **Access to all sites (`<all_urls>`)** — web novel sites are not a fixed list, so
  the extension cannot pre-declare them. Site access is only used on pages you
  explicitly add to a queue.

## User control

- Uninstalling the extension deletes its stored queue state and settings.
- Everything the extension writes is a normal file in your download folder; you
  can delete any of it at any time.
- The full source is available for audit in this repository.

## Contact

Open an issue at <https://github.com/TheJaydenProject/webnovel-to-epub/issues>.
