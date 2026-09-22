/**
 * Minimal read-only WOFF2 inspector for verifying the delivered font files in tests.
 *
 * It decompresses the Brotli table stream with Node's built-in zlib and exposes only the
 * untransformed tables Vertex asserts on (name, OS/2, head, cmap, GSUB, GPOS). It is not a
 * font parser for runtime use.
 */
import { brotliDecompressSync } from 'node:zlib';

// WOFF2 §5.2 known-table tags, indexed by the 6-bit flag value.
const KNOWN_TAGS =
  'cmap head hhea hmtx maxp name OS/2 post cvt_ fpgm glyf loca prep CFF_ VORG EBDT EBLC gasp hdmx kern LTSH PCLT VDMX vhea vmtx BASE GDEF GPOS GSUB EBSC JSTF MATH CBDT CBLC COLR CPAL SVG_ sbix acnt avar bdat bloc bsln cvar fdsc feat fmtx fvar gvar hsty just lcar mort morx opbd prop trak Zapf Silf Glat Gloc Feat Sill'
    .split(' ')
    .map((tag) => tag.replace('_', ' '));

function readBase128(view, offset) {
  let value = 0;
  for (let i = 0; i < 5; i += 1) {
    const byte = view.getUint8(offset + i);
    value = value * 128 + (byte & 0x7f);
    if ((byte & 0x80) === 0) return [value, offset + i + 1];
  }
  throw new Error('Invalid UIntBase128');
}

/** Returns a map of table tag -> DataView for every untransformed table. */
export function readWoff2Tables(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0) !== 0x774f4632) throw new Error('Not a WOFF2 file');
  const numTables = view.getUint16(12);
  const compressedLength = view.getUint32(20);
  let offset = 48;
  const directory = [];
  for (let i = 0; i < numTables; i += 1) {
    const flags = view.getUint8(offset);
    offset += 1;
    let tag = KNOWN_TAGS[flags & 0x3f];
    if ((flags & 0x3f) === 63) {
      tag = String.fromCharCode(...bytes.subarray(offset, offset + 4));
      offset += 4;
    }
    const version = flags >> 6;
    let length;
    [length, offset] = readBase128(view, offset);
    const transformed = tag === 'glyf' || tag === 'loca' ? version !== 3 : version !== 0;
    if (transformed) [length, offset] = readBase128(view, offset);
    directory.push({ tag, length, transformed });
  }
  const stream = brotliDecompressSync(bytes.subarray(offset, offset + compressedLength));
  const tables = new Map();
  let position = 0;
  for (const entry of directory) {
    if (!entry.transformed)
      tables.set(
        entry.tag,
        new DataView(stream.buffer, stream.byteOffset + position, entry.length),
      );
    position += entry.length;
  }
  return tables;
}

const tag = (view, offset) =>
  String.fromCharCode(...[0, 1, 2, 3].map((i) => view.getUint8(offset + i)));

/** Windows/Unicode (3, 1, en-US) name strings keyed by name ID. */
export function readNames(tables) {
  const view = tables.get('name');
  const count = view.getUint16(2);
  const storage = view.getUint16(4);
  const names = new Map();
  for (let i = 0; i < count; i += 1) {
    const record = 6 + i * 12;
    const [platform, encoding, language, id, length, offset] = [0, 2, 4, 6, 8, 10].map((o) =>
      view.getUint16(record + o),
    );
    if (platform !== 3 || encoding !== 1 || language !== 0x409) continue;
    let text = '';
    for (let c = 0; c < length; c += 2)
      text += String.fromCharCode(view.getUint16(storage + offset + c));
    names.set(id, text);
  }
  return names;
}

export function readStyle(tables) {
  const os2 = tables.get('OS/2');
  const head = tables.get('head');
  return {
    weight: os2.getUint16(4),
    italic: (os2.getUint16(62) & 1) === 1 || (head.getUint16(44) & 2) === 2,
  };
}

/**
 * Code points mapped by the best Unicode cmap subtable (format 12 or 4). With
 * `withGlyphs`, returns a map of code point -> glyph id instead of a set.
 */
export function readCodePoints(tables, { withGlyphs = false } = {}) {
  const mapped = readCmap(tables);
  return withGlyphs ? mapped : new Set(mapped.keys());
}

function readCmap(tables) {
  const view = tables.get('cmap');
  const count = view.getUint16(2);
  let format4;
  let format12;
  for (let i = 0; i < count; i += 1) {
    const [platform, encoding] = [view.getUint16(4 + i * 8), view.getUint16(6 + i * 8)];
    const offset = view.getUint32(8 + i * 8);
    const format = view.getUint16(offset);
    if (format === 12 && (platform === 3 || platform === 0)) format12 = offset;
    if (format === 4 && (platform === 3 || platform === 0) && encoding <= 1) format4 = offset;
  }
  const points = new Map();
  if (format12 !== undefined) {
    const groups = view.getUint32(format12 + 12);
    for (let g = 0; g < groups; g += 1) {
      const start = view.getUint32(format12 + 16 + g * 12);
      const end = view.getUint32(format12 + 20 + g * 12);
      const glyph = view.getUint32(format12 + 24 + g * 12);
      for (let cp = start; cp <= end; cp += 1) points.set(cp, glyph + cp - start);
    }
    return points;
  }
  const segments = view.getUint16(format4 + 6) / 2;
  const ends = format4 + 14;
  const starts = ends + segments * 2 + 2;
  const deltas = starts + segments * 2;
  const rangeOffsets = deltas + segments * 2;
  for (let s = 0; s < segments; s += 1) {
    const end = view.getUint16(ends + s * 2);
    const start = view.getUint16(starts + s * 2);
    const delta = view.getInt16(deltas + s * 2);
    const rangeOffset = view.getUint16(rangeOffsets + s * 2);
    for (let cp = start; cp <= end && cp !== 0xffff; cp += 1) {
      let glyph;
      if (rangeOffset === 0) glyph = (cp + delta) & 0xffff;
      else {
        const address = rangeOffsets + s * 2 + rangeOffset + (cp - start) * 2;
        glyph = view.getUint16(address);
        if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
      }
      if (glyph !== 0) points.set(cp, glyph);
    }
  }
  return points;
}

/** Script tags and feature tags declared by an OpenType layout table (GSUB or GPOS). */
export function readLayout(tables, name) {
  const view = tables.get(name);
  if (!view) return { scripts: new Set(), features: new Set() };
  const scriptList = view.getUint16(4);
  const featureList = view.getUint16(6);
  const scripts = new Set();
  const features = new Set();
  for (let i = 0; i < view.getUint16(scriptList); i += 1)
    scripts.add(tag(view, scriptList + 2 + i * 6));
  for (let i = 0; i < view.getUint16(featureList); i += 1)
    features.add(tag(view, featureList + 2 + i * 6));
  return { scripts, features };
}
