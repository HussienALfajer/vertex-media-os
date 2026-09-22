// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cssName, validateTokens } from './token-engine.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const source = JSON.parse(
  readFileSync(new URL('../src/tokens/tokens.json', import.meta.url), 'utf8'),
);
const { tokens } = validateTokens(source);
const defined = new Set([...tokens.keys()].filter((name) => !name.startsWith('ref.')).map(cssName));

function files(directory, pattern) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return entry === 'generated' ? [] : files(path, pattern);
    return pattern.test(entry) && !entry.includes('.spec.') ? [path] : [];
  });
}

const consumers = [
  ...files(join(root, 'packages/ui/src'), /\.(css|tsx?)$/),
  ...files(join(root, 'apps/web/src'), /\.(css|tsx?)$/),
].map((path) => ({ path: path.slice(root.length), text: readFileSync(path, 'utf8') }));
const componentCss = consumers.filter(
  ({ path }) => path.startsWith('packages') && path.endsWith('.css') && !path.endsWith('fonts.css'),
);

describe('token consumption', () => {
  it('references only tokens that exist, never with a fallback that could hide a missing one', () => {
    for (const { path, text } of consumers) {
      for (const [, name] of text.matchAll(/var\((--vx-[a-z0-9-]+)/g))
        expect(defined.has(name), `${path}: ${name}`).toBe(true);
      expect(text, path).not.toMatch(/var\(--vx-[a-z0-9-]+\s*,/);
    }
  });

  it('has no dead component or component-only semantic tokens', () => {
    // Specified roles whose consumers are demand-driven (DS-D029): chart series for the
    // deferred chart component (§37.1) and decorative artwork pending approved assets (§5.2).
    const awaitingConsumer = /^--vx-color-(?:chart-|brand-decorative$)/;
    const everything = consumers.map(({ text }) => text).join('\n');
    const unused = [...tokens.values()]
      .filter((token) => !token.name.startsWith('ref.') && !token.contexts.includes('feature'))
      .map((token) => cssName(token.name))
      .filter((name) => !awaitingConsumer.test(name))
      // Consumed through var() in CSS, or read by name at runtime (popup geometry).
      .filter((name) => !new RegExp(`${name}(?![a-z0-9-])`).test(everything));
    expect(unused).toEqual([]);
  });

  it('keeps raw colours and pixel lengths out of component styles', () => {
    for (const { path, text } of componentCss) {
      const code = text.replace(/\/\*[\s\S]*?\*\//g, '');
      expect(code, path).not.toMatch(/#[\da-f]{3,8}\b/i);
      expect(code, path).not.toMatch(/\b(?:rgb|rgba|hsl|hsla|oklch|color-mix)\(/);
      // Only the 1px clip of the visually-hidden technique is a literal length.
      expect(code, path).not.toMatch(/\b(?!1px\b)\d+px\b/);
    }
  });
});
