// @vitest-environment node
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readCodePoints, readLayout, readNames, readStyle, readWoff2Tables } from './woff2.mjs';

const fonts = new URL('../src/assets/fonts/', import.meta.url);
const inventory = JSON.parse(readFileSync(new URL('inventory.json', fonts), 'utf8')).fonts;
const load = (file) => readWoff2Tables(readFileSync(new URL(file, fonts)));
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const css = readFileSync(new URL('../src/styles/fonts.css', import.meta.url), 'utf8');
const faces = [...css.matchAll(/@font-face\s*{([^}]*)}/g)].map(([, body]) => ({
  family: /font-family:\s*'([^']+)'/.exec(body)?.[1],
  file: /url\('\.\.\/assets\/fonts\/([^']+)'\)/.exec(body)?.[1],
  weight: Number(/font-weight:\s*(\d+)/.exec(body)?.[1]),
  style: /font-style:\s*(\w+)/.exec(body)?.[1],
  display: /font-display:\s*(\w+)/.exec(body)?.[1],
  unicodeRange: /unicode-range:\s*([^;]+);/.exec(body)?.[1],
}));

describe('delivered font files (§12.1)', () => {
  it('match the inventory byte for byte and nothing unlisted is shipped', () => {
    const files = readdirSync(fonts)
      .filter((file) => file.endsWith('.woff2'))
      .sort();
    expect(inventory.map((font) => font.file).sort()).toEqual(files);
    for (const font of inventory) {
      const hash = createHash('sha256')
        .update(readFileSync(new URL(font.file, fonts)))
        .digest('hex');
      expect(hash, font.file).toBe(font.sha256);
      expect(readFileSync(new URL(`../${font.licenseFile}`, import.meta.url), 'utf8')).toContain(
        'SIL Open Font License, Version 1.1',
      );
    }
  });

  it.each(inventory)('$file is the licensed upright face it claims to be', (font) => {
    const tables = load(font.file);
    const names = readNames(tables);
    expect(names.get(16) ?? names.get(1)).toBe(font.family);
    expect(names.get(0)).toMatch(/IBM Corp/);
    expect(names.get(14)).toMatch(/scripts\.sil\.org\/OFL/);
    expect(readStyle(tables)).toEqual({ weight: font.weight, italic: false });
  });

  it('keeps Arabic shaping, joining and mark positioning in every Arabic weight', () => {
    for (const font of inventory.filter((entry) => entry.family === 'IBM Plex Sans Arabic')) {
      const tables = load(font.file);
      const substitution = readLayout(tables, 'GSUB');
      const positioning = readLayout(tables, 'GPOS');
      expect(substitution.scripts.has('arab')).toBe(true);
      for (const feature of ['init', 'medi', 'fina', 'rlig', 'calt'])
        expect(substitution.features.has(feature)).toBe(true);
      for (const feature of ['mark', 'mkmk']) expect(positioning.features.has(feature)).toBe(true);
      const points = readCodePoints(tables);
      // Letters, harakat (diacritics), Arabic punctuation, Arabic-Indic and Persian digits.
      for (const cp of [
        ...range(0x0621, 0x063a),
        ...range(0x0641, 0x064a),
        ...range(0x064b, 0x0652),
        0x060c,
        0x061b,
        0x061f,
        ...range(0x0660, 0x0669),
        ...range(0x06f0, 0x06f9),
      ])
        expect(points.has(cp), cp.toString(16)).toBe(true);
    }
  });

  it('has tabular default Latin figures of one width across 400/500/600 (no tnum feature needed)', () => {
    for (const font of inventory.filter((entry) => entry.family === 'IBM Plex Sans')) {
      const tables = load(font.file);
      expect(readLayout(tables, 'GSUB').features.has('tnum')).toBe(false);
      const glyphs = readCodePoints(tables, { withGlyphs: true });
      const hhea = tables.get('hhea');
      const hmtx = tables.get('hmtx');
      const metrics = hhea.getUint16(34);
      const advance = (glyph) => hmtx.getUint16(4 * Math.min(glyph, metrics - 1));
      const widths = new Set(range(0x30, 0x39).map((cp) => advance(glyphs.get(cp))));
      expect([...widths]).toEqual([600]);
    }
  });
});

describe('@font-face declarations', () => {
  it('declare exactly the inventory with real weights, upright style and swap', () => {
    expect(faces.map((face) => face.file).sort()).toEqual(
      inventory.map((font) => font.file).sort(),
    );
    for (const face of faces) {
      const font = inventory.find((entry) => entry.file === face.file);
      expect([face.family, face.weight, face.style, face.display]).toEqual([
        font.family,
        font.weight,
        'normal',
        'swap',
      ]);
    }
  });

  it('route only Arabic script to the Arabic face, covering all of its Arabic glyphs', () => {
    const arabic = faces.filter((face) => face.family === 'IBM Plex Sans Arabic');
    const ranges = arabic[0].unicodeRange.split(',').map((part) => {
      const [from, to = from] = part.trim().replace('U+', '').split('-');
      return [parseInt(from, 16), parseInt(to, 16)];
    });
    const covered = (cp) => ranges.some(([from, to]) => cp >= from && cp <= to);
    expect(new Set(arabic.map((face) => face.unicodeRange)).size).toBe(1);
    for (const cp of [...range(0x20, 0x7e), 0x2d, 0x2212])
      expect(covered(cp), cp.toString(16)).toBe(false);
    const points = readCodePoints(load('IBMPlexSansArabic-Regular.woff2'));
    const arabicBlocks = [...points].filter(
      (cp) => (cp >= 0x0600 && cp <= 0x08ff) || (cp >= 0xfb50 && cp <= 0xfeff),
    );
    for (const cp of arabicBlocks) expect(covered(cp), cp.toString(16)).toBe(true);
  });
});
