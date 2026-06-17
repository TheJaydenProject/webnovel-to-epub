// Minimal gRPC-Web client for the WuxiaWorld API (api2.wuxiaworld.com).
//
// Scraping the rendered chapter pages can't see paid/early-access chapters
// the user has unlocked, because extension `fetch` requests don't carry the
// site's SameSite session cookie. This API instead reflects exactly what
// the authenticated account (via a bearer token) can access - free and
// unlocked chapters alike - sidestepping the cookie issue entirely.
//
// Field mappings reverse-engineered via blackboxprotobuf (see comments
// below); decoding here is a small generic protobuf reader rather than a
// full schema, since only a handful of fields are needed.

const API_BASE = "https://api2.wuxiaworld.com";
const SERVICE = "wuxiaworld.api.v2";
const CLIENT_VERSION = "2.11.01-c17e9a86";

// --- Protobuf wire-format encoding (request side) ---

function encodeVarint(value) {
  let v = BigInt(value);
  const bytes = [];
  while (true) {
    const b = Number(v & 0x7fn);
    v >>= 7n;
    if (v !== 0n) {
      bytes.push(b | 0x80);
    } else {
      bytes.push(b);
      break;
    }
  }
  return Uint8Array.from(bytes);
}

function concatBytes(...arrays) {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

function fieldInt(field, value) {
  return concatBytes(encodeVarint((field << 3) | 0), encodeVarint(value));
}

function fieldStr(field, value) {
  const bytes = new TextEncoder().encode(value);
  return concatBytes(encodeVarint((field << 3) | 2), encodeVarint(bytes.length), bytes);
}

function fieldMsg(field, innerBytes) {
  return concatBytes(encodeVarint((field << 3) | 2), encodeVarint(innerBytes.length), innerBytes);
}

function grpcFrame(body) {
  const header = new Uint8Array(5);
  header[0] = 0; // flag: data frame
  header[1] = (body.length >>> 24) & 0xff;
  header[2] = (body.length >>> 16) & 0xff;
  header[3] = (body.length >>> 8) & 0xff;
  header[4] = body.length & 0xff;
  return concatBytes(header, body);
}

// --- Protobuf wire-format decoding (response side) ---

function readVarint(bytes, offset) {
  let result = 0;
  let shift = 1;
  let i = offset;
  while (true) {
    const b = bytes[i];
    result += (b & 0x7f) * shift;
    shift *= 128;
    i += 1;
    if ((b & 0x80) === 0) break;
  }
  return [result, i - offset];
}

// Decodes a protobuf message into a Map of field number -> array of
// { wireType, value } entries (value is a Number for varints, a Uint8Array
// for length-delimited fields).
function decodeFields(bytes) {
  const fields = new Map();
  let i = 0;
  while (i < bytes.length) {
    const [tag, tagLen] = readVarint(bytes, i);
    i += tagLen;
    const fieldNum = tag >>> 3;
    const wireType = tag & 0x7;
    let value;
    if (wireType === 0) {
      const [v, len] = readVarint(bytes, i);
      value = v;
      i += len;
    } else if (wireType === 2) {
      const [len, lenLen] = readVarint(bytes, i);
      i += lenLen;
      value = bytes.slice(i, i + len);
      i += len;
    } else if (wireType === 1) {
      value = bytes.slice(i, i + 8);
      i += 8;
    } else if (wireType === 5) {
      value = bytes.slice(i, i + 4);
      i += 4;
    } else {
      throw new Error(`Unsupported protobuf wire type ${wireType}`);
    }
    if (!fields.has(fieldNum)) fields.set(fieldNum, []);
    fields.get(fieldNum).push({ wireType, value });
  }
  return fields;
}

function getVarint(fields, fieldNum) {
  const entry = fields.get(fieldNum)?.[0];
  return entry?.wireType === 0 ? entry.value : undefined;
}

function getBytes(fields, fieldNum) {
  const entry = fields.get(fieldNum)?.[0];
  return entry?.wireType === 2 ? entry.value : undefined;
}

function getString(fields, fieldNum) {
  const bytes = getBytes(fields, fieldNum);
  return bytes ? new TextDecoder().decode(bytes) : undefined;
}

function getMessage(fields, fieldNum) {
  const bytes = getBytes(fields, fieldNum);
  return bytes ? decodeFields(bytes) : undefined;
}

function getAllMessages(fields, fieldNum) {
  const entries = fields.get(fieldNum) || [];
  return entries.filter((e) => e.wireType === 2).map((e) => decodeFields(e.value));
}

// --- gRPC-Web transport ---

// Reads the first data frame (flag 0x00) of a gRPC-Web response and decodes
// it as a protobuf message. Trailer frames (flag 0x80) are ignored.
function parseGrpcResponse(buffer) {
  const bytes = new Uint8Array(buffer);
  let i = 0;
  while (i + 5 <= bytes.length) {
    const flag = bytes[i];
    const len =
      ((bytes[i + 1] << 24) | (bytes[i + 2] << 16) | (bytes[i + 3] << 8) | bytes[i + 4]) >>> 0;
    const data = bytes.slice(i + 5, i + 5 + len);
    if (flag === 0x00 && len > 0) return decodeFields(data);
    i += 5 + len;
  }
  return null;
}

async function callApi(serviceMethod, body, token) {
  const res = await fetch(`${API_BASE}/${SERVICE}.${serviceMethod}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/grpc-web+proto",
      "x-grpc-web": "1",
      "client-version": CLIENT_VERSION,
    },
    body: grpcFrame(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`WuxiaWorld API HTTP ${res.status}`);
  const top = parseGrpcResponse(await res.arrayBuffer());
  if (!top) throw new Error(`WuxiaWorld API: empty response from ${serviceMethod}`);
  return top;
}

// --- Public API ---

// novel_slug -> { novelId }
export async function getNovel(novelSlug, token) {
  const top = await callApi("Novels/GetNovel", fieldStr(2, novelSlug), token);
  const inner = getMessage(top, 1);
  const novelId = inner && getVarint(inner, 1);
  if (novelId === undefined) throw new Error("Could not find novel_id in API response");
  return { novelId };
}

// novel_id -> [{ chapterId, chapterName, chapterSlug, chapterNumber, accessible }]
export async function getChapterList(novelId, token) {
  const top = await callApi("Chapters/GetChapterList", fieldInt(1, novelId), token);
  // The response groups chapters by volume: field 1 repeats once per volume,
  // each containing its own field 6 list of chapters. Flatten across all of
  // them, otherwise only the first volume's chapters are seen.
  const volumes = getAllMessages(top, 1);
  const chapterMsgs = volumes.flatMap((vol) => getAllMessages(vol, 6));
  return chapterMsgs.map((ch) => {
    const accessField = getMessage(ch, 16);
    const accessInner = accessField && getMessage(accessField, 1);
    const accessible = accessInner ? getVarint(accessInner, 1) === 1 : false;
    return {
      chapterId: getVarint(ch, 1),
      chapterName: getString(ch, 2),
      chapterSlug: getString(ch, 3),
      chapterNumber: getVarint(ch, 17),
      accessible,
    };
  });
}

// chapter_id -> chapter HTML fragment (bonus content prepended, if any)
export async function getChapter(chapterId, token) {
  const top = await callApi("Chapters/GetChapter", fieldMsg(1, fieldInt(1, chapterId)), token);
  const inner = getMessage(top, 1);
  if (!inner) throw new Error("Empty GetChapter response");
  const content = getMessage(inner, 5);
  const html = (content && getString(content, 1)) || "";
  const bonus = getMessage(inner, 19);
  const bonusHtml = (bonus && getString(bonus, 1)) || "";
  return bonusHtml ? `${bonusHtml}\n${html}`.trim() : html;
}
