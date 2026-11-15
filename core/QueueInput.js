// Accept web URLs only: these will be opened with extension permissions.
export function validateNovelUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("Enter a complete http:// or https:// URL."); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Use an HTTP or HTTPS URL without an embedded username or password.");
  }
  url.hash = "";
  return url.href;
}

export function parseQueueInput(text) {
  return text.split(/\r?\n/).flatMap((line, index) => {
    if (!line.trim()) return [];
    const parts = line.split("|").map((part) => part.trim());
    try {
      if (parts.length > 2) throw new Error("Use index URL | first chapter URL, with only one | separator.");
      const tocUrl = validateNovelUrl(parts[0]);
      const firstChapterUrl = parts[1] ? validateNovelUrl(parts[1]) : "";
      return [{ tocUrl, firstChapterUrl }];
    } catch (err) {
      // Do not echo malformed URLs: they may contain credentials.
      return [{ error: `Line ${index + 1}: ${err.message}` }];
    }
  });
}
