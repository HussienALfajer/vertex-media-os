/**
 * Design-system conformance for application code (docs/DESIGN_SYSTEM.md §26.3, §43; DS-D028).
 *
 * `vertex-ui/no-raw-styling` inspects static class strings in JSX `className` attributes and
 * rejects styling that bypasses the semantic Tailwind bridge. Utilities for layout,
 * placement and semantic roles remain allowed.
 */
const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white';
const COLOR_UTILITIES =
  'bg|text|border|border-[xytrblse]|ring|ring-offset|outline|fill|stroke|from|via|to|decoration|accent|caret|shadow|divide|placeholder';

export const RULES = [
  {
    id: 'arbitrary',
    pattern: /(?:^|[\s:])!?-?[a-z][\w-]*-\[[^\]]*\]/,
    message:
      'Arbitrary Tailwind values bypass the token system; use a semantic utility or a shared component.',
  },
  {
    id: 'physical',
    pattern:
      /(?:^|[\s:])-?(?:m[lr]|p[lr]|left|right|scroll-[mp][lr]|border-[lr]|rounded-(?:[lr]|tl|tr|bl|br)|text-(?:left|right)|float-(?:left|right)|clear-(?:left|right))(?:-|$|\s)/,
    message:
      'Physical left/right utilities break RTL; use logical utilities (ms-, me-, ps-, pe-, start-, end-, text-start, text-end).',
  },
  {
    id: 'palette',
    pattern: new RegExp(
      `(?:^|[\\s:])(?:${COLOR_UTILITIES})-(?:${PALETTE})(?:-\\d+)?(?:\\/\\d+)?(?:$|\\s)`,
    ),
    message:
      'Raw palette colours are not part of Vertex; use semantic roles such as text-secondary or bg-surface.',
  },
  {
    id: 'dark',
    pattern: /(?:^|\s)(?:[\w-]+:)*dark:/,
    message: 'Dark mode is a semantic token mapping; local dark: overrides are forbidden.',
  },
  {
    id: 'internal',
    pattern: /(?:^|[\s:])vx-/,
    message:
      'vx-* classes are @vertex-os/ui internals; compose the shared component or a semantic utility instead.',
  },
  {
    id: 'layer',
    pattern: /(?:^|[\s:])-?z-/,
    message:
      'Stacking order belongs to the shared overlay manager and layer tokens, not feature z-index.',
  },
];

export function findViolations(classes) {
  return RULES.filter((rule) => rule.pattern.test(classes));
}

function staticStrings(node) {
  if (!node) return [];
  switch (node.type) {
    case 'Literal':
      return typeof node.value === 'string' ? [node.value] : [];
    case 'TemplateLiteral':
      return node.quasis.map((quasi) => quasi.value.cooked ?? '');
    case 'JSXExpressionContainer':
      return staticStrings(node.expression);
    case 'ConditionalExpression':
      return [...staticStrings(node.consequent), ...staticStrings(node.alternate)];
    case 'LogicalExpression':
      return [...staticStrings(node.left), ...staticStrings(node.right)];
    case 'CallExpression':
      return node.arguments.flatMap(staticStrings);
    case 'ArrayExpression':
      return node.elements.flatMap(staticStrings);
    default:
      return [];
  }
}

const noRawStyling = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow styling that bypasses Vertex semantic tokens.' },
    schema: [],
  },
  create(context) {
    return {
      JSXAttribute(node) {
        if (node.name.name !== 'className') return;
        for (const value of staticStrings(node.value))
          for (const violation of findViolations(value))
            context.report({
              node,
              message: `${violation.message} (${violation.id}: "${value.trim()}")`,
            });
      },
    };
  },
};

export default {
  meta: { name: 'vertex-ui' },
  rules: { 'no-raw-styling': noRawStyling },
};
