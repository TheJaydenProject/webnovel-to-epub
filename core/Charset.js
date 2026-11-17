// Decodes a fetched HTML page with the charset it declares. `Response.text()`
// always assumes UTF-8, which garbles GBK/Big5/Shift_JIS sites that declare
// their encoding only in a <meta> tag (e.g. kanunu8.com).
export function decodeHtml(buffer, contentType) {
  const bytes = new Uint8Array(buffer);
  const head = new TextDecoder("windows-1252").decode(bytes.subarray(0, 4096));
  const label = /charset=["']?([\w-]+)/i.exec(contentType || "")?.[1]
    || /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1]
    || "utf-8";
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    // Unknown labels throw RangeError; UTF-8 is the web's default.
    return new TextDecoder("utf-8").decode(bytes);
  }
}
