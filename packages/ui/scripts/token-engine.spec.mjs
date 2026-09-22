// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cssName, generateTokens, MODES, validateTokens } from './token-engine.mjs';

const source = JSON.parse(readFileSync(new URL('../src/tokens/tokens.json', import.meta.url)));
const mutate = (change) => {
  const copy = structuredClone(source);
  change(copy.tokens);
  return copy;
};
const find = (tokens, name) => tokens.find((token) => token.name === name);

describe('token source validation', () => {
  it('accepts the canonical source and resolves every mode combination', () => {
    const { resolve } = validateTokens(source);
    expect(resolve('color.background.canvas', { theme: 'light' })).toBe('#F8F8F3');
    expect(resolve('color.background.canvas', { theme: 'dark' })).toBe('#101915');
    expect(resolve('color.background.sidebar', { theme: 'dark' })).toBe('#18231E');
    expect(resolve('size.control.block', { density: 'compact' })).toBe('2.25rem');
    expect(resolve('component.table.row.min-block', { density: 'default' })).toBe('3rem');
    expect(resolve('font.family.ui', { language: 'ar' })).toMatch(
      /^"IBM Plex Sans Arabic", "IBM Plex Sans"/,
    );
    expect(resolve('font.family.ui', { language: 'en' })).toMatch(
      /^"IBM Plex Sans", "IBM Plex Sans Arabic"/,
    );
  });

  it.each([
    ['duplicate names', (t) => t.push({ ...t[0] })],
    [
      'CSS-name collisions',
      (t) => t.push({ ...find(t, 'space.page.gutter'), name: 'space.page-gutter' }),
    ],
    ['unknown types', (t) => void (t[0].type = 'gradient')],
    ['undeclared modes', (t) => void (t[0].mode = 'brand')],
    ['placeholder descriptions', (t) => void (t[0].description = 'ref')],
    ['unknown contexts', (t) => void (find(t, 'color.text.primary').contexts = ['page'])],
    ['malformed colours', (t) => void (t[0].values.default = 'red; display: none')],
    ['lowercase hex drift', (t) => void (t[0].values.default = '#ffffff')],
    [
      'undelivered font weights',
      (t) => void (find(t, 'ref.font.weight.600').values.default = '700'),
    ],
    [
      'pixel dimensions outside hairlines',
      (t) => void (find(t, 'ref.space.4').values.default = '16px'),
    ],
    ['missing theme mappings', (t) => void delete find(t, 'color.text.primary').values.dark],
    ['missing density mappings', (t) => void delete find(t, 'size.control.block').values.compact],
    ['missing language mappings', (t) => void delete find(t, 'font.family.ui').values.en],
    ['reference values that vary by mode', (t) => void (t[0].mode = 'theme')],
    [
      'unresolved aliases',
      (t) => void (find(t, 'color.text.primary').values.light = '{ref.color.missing.1}'),
    ],
    [
      'alias cycles',
      (t) => void (find(t, 'color.background.canvas').values.light = '{color.background.sidebar}'),
    ],
    ['type mismatches', (t) => void (find(t, 'color.text.primary').values.light = '{ref.space.4}')],
    ['raw semantic values', (t) => void (find(t, 'color.text.primary').values.light = '#000000')],
    ['references that alias', (t) => void (t[0].values.default = '{color.text.primary}')],
    [
      'semantic roles depending on components',
      (t) =>
        void (find(t, 'size.textarea.min-block').values.default =
          '{component.table.row.touch-min-block}'),
    ],
    [
      'component tokens bypassing semantics',
      (t) => void (find(t, 'component.dialog.inline').values.default = '{ref.size.480}'),
    ],
    [
      'raw component values without a decision',
      (t) => void delete find(t, 'component.dialog.inline').decision,
    ],
    ['component ownership drift', (t) => void (find(t, 'component.dialog.inline').owner = 'table')],
    [
      'components exposed to features',
      (t) => void (find(t, 'component.dialog.inline').contexts = ['component', 'feature']),
    ],
    ['public references', (t) => void (t[0].contexts = ['feature'])],
    [
      'mode-axis crossing',
      (t) => void (find(t, 'size.textarea.min-block').values.default = '{size.control.block}'),
    ],
    [
      'bridging private roles',
      (t) => void (find(t, 'color.focus.ring').tailwind = ['--text-color-focus']),
    ],
    ['unreachable feature roles', (t) => void delete find(t, 'color.text.primary').tailwind],
    [
      'duplicate bridges',
      (t) => void (find(t, 'color.text.muted').tailwind = ['--text-color-primary']),
    ],
  ])('rejects %s', (_name, change) => {
    expect(() => validateTokens(mutate(change))).toThrow(/Token contract/);
  });
});

describe('token generation', () => {
  it('is deterministic, order-independent and matches the committed artifacts', () => {
    const generated = generateTokens(source);
    expect(generateTokens({ ...source, tokens: [...source.tokens].reverse() })).toEqual(generated);
    for (const [file, content] of Object.entries(generated))
      expect(readFileSync(new URL(`../src/generated/${file}`, import.meta.url), 'utf8')).toBe(
        content,
      );
  });

  it('keeps reference stops private and exposes only feature roles to Tailwind', () => {
    const { 'tokens.css': css, 'tailwind.css': tailwind } = generateTokens(source);
    expect(css).not.toContain('--vx-ref-');
    expect(tailwind).toContain('--*: initial;');
    expect(tailwind).not.toMatch(/--color-|--vx-color-action|--vx-color-focus|--radius-|--shadow-/);
    for (const token of source.tokens.filter((t) => t.name.startsWith('component.')))
      expect(tailwind).not.toContain(cssName(token.name));
  });

  it('emits every mode block with explicit colour schemes', () => {
    const css = generateTokens(source)['tokens.css'];
    for (const selector of [
      ":root[data-theme='dark']",
      ':root:not([data-theme])',
      ":root[data-density='compact']",
      ':root:lang(en)',
      '@media (pointer: coarse)',
      '@media print',
      '@media (prefers-color-scheme: dark)',
    ])
      expect(css).toContain(selector);
    expect(css.match(/color-scheme: dark;/g)).toHaveLength(2);
    expect(Object.keys(MODES)).toEqual(['fixed', 'theme', 'density', 'language']);
  });
});

describe('rendered colour pairs', () => {
  const { resolve } = validateTokens(source);
  const channel = (hex, i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
  const linear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const luminance = (hex) =>
    [0.2126, 0.7152, 0.0722].reduce((sum, weight, i) => sum + weight * linear(channel(hex, i)), 0);
  const ratio = (a, b) => {
    const [x, y] = [luminance(a), luminance(b)];
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const color = (theme, name) => resolve(`color.${name}`, { theme });
  const pair = (theme, fg, bg) => ratio(color(theme, fg), color(theme, bg));

  it('reproduces every calculated ratio published in DESIGN_SYSTEM.md §9.4', () => {
    const published = [
      ['light', 'text.secondary', 'background.subtle', 5.19],
      ['dark', 'text.muted', 'background.subtle', 4.61],
      ['light', 'action.primary.foreground', 'action.primary.background', 10.48],
      ['dark', 'action.primary.foreground', 'action.primary.background', 9.18],
      ['dark', 'action.primary.foreground', 'action.primary.pressed', 6.96],
      ['light', 'focus.ring', 'background.subtle', 4.89],
      ['dark', 'focus.ring', 'background.subtle', 6.16],
      ['light', 'status.success.foreground', 'status.success.background', 7.18],
      ['light', 'status.warning.foreground', 'status.warning.background', 6.17],
      ['light', 'status.danger.foreground', 'status.danger.background', 5.43],
      ['light', 'status.info.foreground', 'status.info.background', 5.75],
      ['dark', 'status.success.foreground', 'status.success.background', 7.71],
      ['dark', 'status.warning.foreground', 'status.warning.background', 7.63],
      ['dark', 'status.danger.foreground', 'status.danger.background', 7.58],
      ['dark', 'status.info.foreground', 'status.info.background', 7.16],
    ];
    for (const [theme, fg, bg, expected] of published)
      expect(Number(pair(theme, fg, bg).toFixed(2)), `${theme} ${fg} / ${bg}`).toBe(expected);
    expect(Number(ratio('#B9A87A', '#FFFFFF').toFixed(2))).toBe(2.35);
    expect(Number(ratio('#B9A87A', '#004139').toFixed(2))).toBe(4.93);
  });

  it.each(['light', 'dark'])('meets text and control thresholds in %s', (theme) => {
    const planes = ['canvas', 'surface', 'raised', 'subtle'].map((p) => `background.${p}`);
    for (const plane of planes) {
      for (const text of [
        'text.primary',
        'text.secondary',
        'text.muted',
        'text.link',
        'brand.accent',
      ])
        expect(pair(theme, text, plane), `${text} / ${plane}`).toBeGreaterThanOrEqual(4.5);
      for (const boundary of ['border.strong', 'field.border', 'focus.ring'])
        expect(pair(theme, boundary, plane), `${boundary} / ${plane}`).toBeGreaterThanOrEqual(3);
    }
    for (const tone of ['neutral', 'info', 'success', 'warning', 'danger']) {
      expect(
        pair(theme, `status.${tone}.foreground`, `status.${tone}.background`),
      ).toBeGreaterThanOrEqual(4.5);
      for (const plane of planes)
        expect(
          pair(theme, `status.${tone}.foreground`, plane),
          `${tone} / ${plane}`,
        ).toBeGreaterThanOrEqual(4.5);
    }
    for (const intent of ['primary', 'danger'])
      for (const state of ['background', 'hover', 'pressed'])
        expect(
          pair(theme, `action.${intent}.foreground`, `action.${intent}.${state}`),
        ).toBeGreaterThanOrEqual(4.5);
    for (const fill of ['state.selected.background', 'state.selected.hover'])
      expect(pair(theme, 'state.selected.foreground', fill)).toBeGreaterThanOrEqual(4.5);
    expect(
      pair(theme, 'selection.text.foreground', 'selection.text.background'),
    ).toBeGreaterThanOrEqual(4.5);
    // Switch thumbs and checked controls are essential graphics (§9.2, §14).
    expect(pair(theme, 'text.secondary', 'background.subtle')).toBeGreaterThanOrEqual(3);
    expect(pair(theme, 'action.primary.background', 'background.surface')).toBeGreaterThanOrEqual(
      3,
    );
    expect(
      pair(theme, 'state.selected.indicator', 'state.selected.background'),
    ).toBeGreaterThanOrEqual(3);
  });

  it('keeps the categorical chart series above the published minima (§37.1)', () => {
    // §9.4/§37.1 publish ratios rounded to two decimals; compare under the same convention.
    const published = (value) => Number(value.toFixed(2));
    const light = [];
    const dark = [];
    for (let series = 1; series <= 6; series += 1) {
      light.push(ratio(color('light', `chart.series.${series}`), '#FFFFFF'));
      dark.push(pair('dark', `chart.series.${series}`, 'background.raised'));
    }
    expect(published(Math.min(...light))).toBe(5.35);
    expect(published(Math.min(...dark))).toBe(6.73);
    for (const value of [...light, ...dark]) expect(value).toBeGreaterThanOrEqual(4.5);
  });
});
