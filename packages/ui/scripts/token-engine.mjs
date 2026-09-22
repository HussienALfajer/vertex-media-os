/**
 * Validates and generates the Vertex token contract (docs/DESIGN_SYSTEM.md §7, §40.2).
 *
 * The source is an array of token records rather than a nested object so that duplicate
 * names stay detectable (JSON objects silently keep the last duplicate key).
 */

/** Mode axes and their values. A token varies along at most one axis. */
export const MODES = {
  fixed: ['default'],
  theme: ['light', 'dark'],
  density: ['default', 'compact'],
  language: ['ar', 'en'],
};

const SEMANTIC_CATEGORIES = new Set([
  'color',
  'space',
  'size',
  'radius',
  'border',
  'shadow',
  'layer',
  'motion',
  'font',
  'type',
  'focus',
]);
const CONTEXTS = new Set(['foundation', 'component', 'feature']);
const DELIVERED_WEIGHTS = new Set(['400', '500', '600']);
const FAMILY = /^(?:"[A-Za-z0-9 ]+"|[A-Za-z][A-Za-z-]*)$/;

const TYPES = {
  color: (value) => /^#[\dA-F]{6}$/.test(value) || /^rgb\(0 0 0 \/ \d{1,2}%\)$/.test(value),
  dimension: (value) => /^(?:0|\d+(?:\.\d+)?(?:rem|px))$/.test(value),
  number: (value) => /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value),
  duration: (value) => /^(?:0|[1-9]\d*)ms$/.test(value),
  easing: (value) =>
    /^cubic-bezier\((?:0|1|0\.\d+), (?:0|1|0\.\d+), (?:0|1|0\.\d+), (?:0|1|0\.\d+)\)$/.test(value),
  'font-family': (value) => value.split(', ').every((part) => FAMILY.test(part)),
  'font-weight': (value) => DELIVERED_WEIGHTS.has(value),
  shadow: (value) => value === 'none' || /^0 \d+px \d+px rgb\(0 0 0 \/ \d{1,2}%\)$/.test(value),
};

/** Hairlines and the "round" radius are the only non-rem dimensions (§14, §15). */
const PIXEL_TOKENS = /^ref\.(?:border\.\d+|radius\.full)$/;
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+$/;
const BRIDGE =
  /^--(?:background-color|text-color|border-color|spacing|container|breakpoint|font|default-font-family|default-mono-font-family)(?:-[a-z0-9]+)*$/;
const DECISION = /^DESIGN_SYSTEM\.md §\d+(?:\.\d+)?$/;

export const cssName = (name) => `--vx-${name.replaceAll('.', '-')}`;
const aliasTarget = (value) => /^\{([a-z0-9.-]+)\}$/.exec(value)?.[1];
const layerOf = (name) =>
  name.startsWith('ref.') ? 'reference' : name.startsWith('component.') ? 'component' : 'semantic';

function fail(message) {
  throw new Error(`Token contract: ${message}`);
}

function validateRecord(token) {
  if (!token || typeof token !== 'object') fail('every entry must be an object');
  const { name } = token;
  if (typeof name !== 'string' || !NAME.test(name)) fail(`invalid name ${JSON.stringify(name)}`);
  if (!Object.hasOwn(TYPES, token.type)) fail(`${name}: unknown type ${token.type}`);
  if (!Object.hasOwn(MODES, token.mode)) fail(`${name}: undeclared mode ${token.mode}`);
  if (typeof token.description !== 'string' || token.description.trim().length < 12)
    fail(`${name}: a meaningful description is required`);
  if (
    !Array.isArray(token.contexts) ||
    token.contexts.length === 0 ||
    token.contexts.some((context) => !CONTEXTS.has(context)) ||
    new Set(token.contexts).size !== token.contexts.length
  )
    fail(`${name}: contexts must be distinct values from ${[...CONTEXTS].join(', ')}`);
  const expected = MODES[token.mode];
  const actual = Object.keys(token.values ?? {});
  if (actual.length !== expected.length || expected.some((mode) => !actual.includes(mode)))
    fail(`${name}: values must define exactly ${expected.join(', ')}`);
  if (Object.values(token.values).some((value) => typeof value !== 'string'))
    fail(`${name}: values must be strings`);

  const layer = layerOf(name);
  if (layer === 'reference') {
    if (token.mode !== 'fixed') fail(`${name}: reference values cannot vary by mode`);
    if (token.owner !== 'foundations' || token.contexts.join() !== 'foundation')
      fail(`${name}: references are owned by foundations and private to them`);
  } else if (layer === 'component') {
    if (token.owner !== name.split('.')[1]) fail(`${name}: owner must be its component`);
    if (token.contexts.join() !== 'component') fail(`${name}: component tokens are component-only`);
  } else {
    if (!SEMANTIC_CATEGORIES.has(name.split('.')[0])) fail(`${name}: unknown semantic category`);
    if (token.owner !== 'foundations') fail(`${name}: semantic roles are owned by foundations`);
    if (token.contexts.includes('foundation')) fail(`${name}: semantic roles are public roles`);
  }
  if (token.decision !== undefined && (layer !== 'component' || !DECISION.test(token.decision)))
    fail(`${name}: only component tokens cite a specification decision`);
  if (token.tailwind !== undefined) {
    if (
      !Array.isArray(token.tailwind) ||
      token.tailwind.length === 0 ||
      token.tailwind.some((bridge) => !BRIDGE.test(bridge))
    )
      fail(`${name}: invalid Tailwind bridge`);
    if (!token.contexts.includes('feature')) fail(`${name}: only feature roles are bridged`);
  }
  if (
    token.contexts.includes('feature') &&
    !token.name.startsWith('type.') &&
    token.tailwind === undefined
  )
    fail(`${name}: a feature role must be reachable through the Tailwind bridge`);
}

/** Validates the whole source and returns a resolver over every mode combination. */
export function validateTokens(source) {
  if (source?.version !== 1 || !Array.isArray(source.tokens) || source.tokens.length === 0)
    fail('expected { version: 1, tokens: [...] }');
  const tokens = new Map();
  const cssNames = new Set();
  const bridges = new Set();
  for (const token of source.tokens) {
    validateRecord(token);
    if (tokens.has(token.name) || cssNames.has(cssName(token.name)))
      fail(`duplicate name or CSS variable for ${token.name}`);
    for (const bridge of token.tailwind ?? []) {
      if (bridges.has(bridge)) fail(`duplicate Tailwind bridge ${bridge}`);
      bridges.add(bridge);
    }
    tokens.set(token.name, token);
    cssNames.add(cssName(token.name));
  }

  function resolve(name, mode, trail = []) {
    const token = tokens.get(name);
    if (!token) fail(`unresolved alias ${name}`);
    if (trail.includes(name)) fail(`alias cycle ${[...trail, name].join(' -> ')}`);
    const value = token.values[token.mode === 'fixed' ? 'default' : mode[token.mode]];
    const target = aliasTarget(value);
    if (target === undefined) {
      const layer = layerOf(name);
      if (layer === 'semantic') fail(`${name}: semantic roles must alias another token`);
      if (layer === 'component' && token.decision === undefined)
        fail(`${name}: a raw component value must cite its DESIGN_SYSTEM.md decision`);
      if (!TYPES[token.type](value)) fail(`${name}: malformed ${token.type} value ${value}`);
      if (token.type === 'dimension' && value.endsWith('px') && !PIXEL_TOKENS.test(name))
        fail(`${name}: dimensions are rem equivalents except hairlines`);
      return value;
    }
    const targetToken = tokens.get(target);
    if (!targetToken) fail(`${name}: unresolved alias ${target}`);
    const from = layerOf(name);
    const to = layerOf(target);
    if (from === 'reference') fail(`${name}: references hold raw values only`);
    if (to === 'component') fail(`${name}: nothing may depend on a component token`);
    if (from === 'component' && to === 'reference')
      fail(`${name}: component tokens must use a semantic role, not a reference`);
    if (targetToken.type !== token.type) fail(`${name}: alias type mismatch with ${target}`);
    if (targetToken.mode !== 'fixed' && targetToken.mode !== token.mode)
      fail(`${name}: alias crosses mode axes (${token.mode} -> ${targetToken.mode})`);
    return resolve(target, mode, [...trail, name]);
  }

  for (const name of tokens.keys())
    for (const theme of MODES.theme)
      for (const density of MODES.density)
        for (const language of MODES.language) resolve(name, { theme, density, language });

  return {
    tokens,
    resolve: (name, mode = {}) =>
      resolve(name, { theme: 'light', density: 'default', language: 'ar', ...mode }),
  };
}

const HEADER =
  '/* Generated from src/tokens/tokens.json by scripts/generate-tokens.mjs. Do not edit by hand. */';

/** Produces deterministic CSS custom properties and the Tailwind semantic bridge. */
export function generateTokens(source) {
  const { tokens, resolve } = validateTokens(source);
  const ordered = [...tokens.values()]
    .filter((token) => layerOf(token.name) !== 'reference')
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const block = (selector, axis, mode, extra = [], indent = '') => {
    const lines = ordered
      .filter((token) => token.mode === axis)
      .map((token) => `${indent}  ${cssName(token.name)}: ${resolve(token.name, mode)};`);
    return `${indent}${selector} {\n${[...extra.map((line) => `${indent}  ${line}`), ...lines].join('\n')}\n${indent}}`;
  };
  const light = { theme: 'light' };
  const dark = { theme: 'dark' };
  const css = [
    HEADER,
    block(':root', 'fixed', {}),
    block(":root,\n:root[data-theme='light']", 'theme', light, ['color-scheme: light;']),
    block(":root[data-theme='dark']", 'theme', dark, ['color-scheme: dark;']),
    '/* First paint follows the system theme until the bootstrap sets an explicit theme. */',
    `@media (prefers-color-scheme: dark) {\n${block(':root:not([data-theme])', 'theme', dark, ['color-scheme: dark;'], '  ')}\n}`,
    block(":root,\n:root[data-density='default']", 'density', { density: 'default' }),
    block(":root[data-density='compact']", 'density', { density: 'compact' }),
    '/* Coarse pointers always resolve to Default geometry (§14). */',
    `@media (pointer: coarse) {\n${block(':root[data-density]', 'density', { density: 'default' }, [], '  ')}\n}`,
    block(':root,\n:root:lang(ar)', 'language', { language: 'ar' }),
    block(':root:lang(en)', 'language', { language: 'en' }),
    '/* Print and export use the explicit Light presentation (§40.2). */',
    `@media print {\n${block(':root[data-theme],\n  :root:not([data-theme])', 'theme', light, ['color-scheme: light;'], '  ')}\n}`,
  ].join('\n\n');

  const theme = [];
  const utilities = [];
  for (const token of ordered) {
    for (const bridge of token.tailwind ?? []) {
      // Media queries cannot read custom properties, so breakpoints carry resolved values.
      const value = bridge.startsWith('--breakpoint-')
        ? resolve(token.name)
        : `var(${cssName(token.name)})`;
      theme.push(`  ${bridge}: ${value};`);
    }
  }
  const roles = [
    ...new Set(
      ordered
        .filter((token) => token.name.startsWith('type.') && token.contexts.includes('feature'))
        .map((token) => token.name.split('.')[1]),
    ),
  ];
  for (const role of roles) {
    for (const part of ['size', 'line-height', 'weight'])
      if (!tokens.has(`type.${role}.${part}`)) fail(`type.${role} is missing ${part}`);
    utilities.push(
      `@utility type-${role} {\n  font-size: var(${cssName(`type.${role}.size`)});\n  line-height: var(${cssName(`type.${role}.line-height`)});\n  font-weight: var(${cssName(`type.${role}.weight`)});\n}`,
    );
  }
  const tailwind = [
    HEADER,
    '/* Only semantic feature roles exist; every default Tailwind scale is removed (DS-D021). */',
    `@theme inline {\n  --*: initial;\n${theme.join('\n')}\n}`,
    ...utilities,
  ].join('\n\n');

  // Public roles only (no reference stops): the lab's token specimens read this inventory.
  const catalog = ordered.map((token) => ({
    name: token.name,
    variable: cssName(token.name),
    type: token.type,
    mode: token.mode,
    layer: layerOf(token.name),
    contexts: token.contexts,
    description: token.description,
  }));
  const ts = `${HEADER.replace('/*', '//').replace(' */', '')}\nexport interface TokenInfo {\n  readonly name: string;\n  readonly variable: \`--vx-\${string}\`;\n  readonly type: string;\n  readonly mode: 'fixed' | 'theme' | 'density' | 'language';\n  readonly layer: 'semantic' | 'component';\n  readonly contexts: readonly string[];\n  readonly description: string;\n}\n\nexport const TOKEN_CATALOG: readonly TokenInfo[] = ${JSON.stringify(catalog, null, 2)};\n`;

  return { 'tokens.css': `${css}\n`, 'tailwind.css': `${tailwind}\n`, 'tokens.ts': ts };
}
