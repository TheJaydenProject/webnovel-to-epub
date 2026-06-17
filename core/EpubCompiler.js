// Assembles sanitized chapter fragments and image blobs into a valid
// EPUB3 (with EPUB2 NCX for backwards compatibility) container using
// the locally-vendored JSZip.

function escapeXml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  }[c]));
}

function mediaTypeForFilename(filename) {
  const ext = filename.split(".").pop().toLowerCase();
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

const STYLES_CSS = `body {
  font-family: serif;
  line-height: 1.5;
  margin: 1em;
}
h1, h2, h3, h4, h5, h6 {
  font-family: sans-serif;
  text-align: center;
}
p {
  margin: 0 0 1em 0;
  text-indent: 1.5em;
}
img {
  max-width: 100%;
}
`;

export class EpubCompiler {
  constructor({ title, author, language = "en" }) {
    this.title = title;
    this.author = author || "Unknown";
    this.language = language;
    this.identifier = `urn:uuid:${crypto.randomUUID()}`;
    this.chapters = [];
    this.images = [];
    this.cover = null;
  }

  // Returns the chapter's filename (for cross-referencing in the spine).
  addChapter(title, xhtmlFragment) {
    const index = this.chapters.length + 1;
    const id = `chap${index}`;
    const filename = `chapter${String(index).padStart(4, "0")}.xhtml`;
    this.chapters.push({ id, filename, title, xhtmlFragment });
    return filename;
  }

  addImage(filename, blob) {
    this.images.push({ filename, blob, mediaType: mediaTypeForFilename(filename) });
  }

  setCover(filename, blob) {
    this.cover = { filename, blob, mediaType: mediaTypeForFilename(filename) };
  }

  async generate() {
    const zip = new JSZip();
    zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
    zip.file("META-INF/container.xml", this._containerXml());
    zip.file("OEBPS/content.opf", this._contentOpf());
    zip.file("OEBPS/nav.xhtml", this._navXhtml());
    zip.file("OEBPS/toc.ncx", this._tocNcx());
    zip.file("OEBPS/styles.css", STYLES_CSS);

    for (const chapter of this.chapters) {
      zip.file(`OEBPS/text/${chapter.filename}`, this._chapterXhtml(chapter));
    }
    for (const image of this.images) {
      zip.file(`OEBPS/images/${image.filename}`, image.blob);
    }
    if (this.cover) {
      zip.file(`OEBPS/images/${this.cover.filename}`, this.cover.blob);
      zip.file("OEBPS/text/cover.xhtml", this._coverXhtml());
    }

    return zip.generateAsync({ type: "blob", mimeType: "application/epub+zip", compression: "DEFLATE", compressionOptions: { level: 9 } });
  }

  _containerXml() {
    return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
  }

  _contentOpf() {
    const manifestItems = [
      `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
      `<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`,
      `<item id="css" href="styles.css" media-type="text/css"/>`,
    ];

    if (this.cover) {
      manifestItems.push(
        `<item id="cover-image" href="images/${this.cover.filename}" media-type="${this.cover.mediaType}" properties="cover-image"/>`,
        `<item id="cover" href="text/cover.xhtml" media-type="application/xhtml+xml"/>`
      );
    }
    for (const chapter of this.chapters) {
      manifestItems.push(
        `<item id="${chapter.id}" href="text/${chapter.filename}" media-type="application/xhtml+xml"/>`
      );
    }
    for (const [i, image] of this.images.entries()) {
      manifestItems.push(
        `<item id="img${i + 1}" href="images/${image.filename}" media-type="${image.mediaType}"/>`
      );
    }

    const spineItems = this.chapters.map((c) => `<itemref idref="${c.id}"/>`);
    if (this.cover) spineItems.unshift(`<itemref idref="cover"/>`);
    const coverMeta = this.cover ? `\n    <meta name="cover" content="cover-image"/>` : "";
    const modified = new Date().toISOString().replace(/\.\d+Z$/, "Z");

    return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="BookId" xml:lang="${this.language}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">${this.identifier}</dc:identifier>
    <dc:title>${escapeXml(this.title)}</dc:title>
    <dc:language>${this.language}</dc:language>
    <dc:creator>${escapeXml(this.author)}</dc:creator>
    <meta property="dcterms:modified">${modified}</meta>${coverMeta}
  </metadata>
  <manifest>
    ${manifestItems.join("\n    ")}
  </manifest>
  <spine toc="ncx">
    ${spineItems.join("\n    ")}
  </spine>
</package>`;
  }

  _navXhtml() {
    const items = [
      ...(this.cover ? [`<li><a href="text/cover.xhtml">Cover</a></li>`] : []),
      ...this.chapters.map((c) => `<li><a href="text/${c.filename}">${escapeXml(c.title)}</a></li>`),
    ].join("\n      ");

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Table of Contents</title></head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Table of Contents</h1>
    <ol>
      ${items}
    </ol>
  </nav>
</body>
</html>`;
  }

  _tocNcx() {
    let playOrder = 1;
    const navPoints = [
      ...(this.cover
        ? [`<navPoint id="navPoint-cover" playOrder="${playOrder++}">
      <navLabel><text>Cover</text></navLabel>
      <content src="text/cover.xhtml"/>
    </navPoint>`]
        : []),
      ...this.chapters.map(
        (c, i) => `<navPoint id="navPoint-${i + 1}" playOrder="${playOrder++}">
      <navLabel><text>${escapeXml(c.title)}</text></navLabel>
      <content src="text/${c.filename}"/>
    </navPoint>`
      ),
    ].join("\n    ");

    return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${this.identifier}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${escapeXml(this.title)}</text></docTitle>
  <navMap>
    ${navPoints}
  </navMap>
</ncx>`;
  }

  _coverXhtml() {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <title>Cover</title>
  <style>
    html, body { margin: 0; padding: 0; height: 100%; }
    .cover { display: flex; justify-content: center; align-items: center; height: 100%; }
    .cover img { max-width: 100%; max-height: 100%; }
  </style>
</head>
<body epub:type="cover">
  <div class="cover">
    <img src="../images/${this.cover.filename}" alt="Cover"/>
  </div>
</body>
</html>`;
  }

  _chapterXhtml(chapter) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${escapeXml(chapter.title)}</title>
  <link rel="stylesheet" type="text/css" href="../styles.css"/>
</head>
<body>
  <h1>${escapeXml(chapter.title)}</h1>
  ${chapter.xhtmlFragment}
</body>
</html>`;
  }
}
