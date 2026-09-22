import nx from '@nx/eslint-plugin';
import vertexUi from '../../packages/ui/lint/vertex-ui-plugin.mjs';
import baseConfig from '../../eslint.config.mjs';

export default [
  ...nx.configs['flat/react'],
  ...baseConfig,
  {
    ignores: ['**/out-tsc', 'src/routeTree.gen.ts'],
  },
  {
    // Feature markup composes semantic roles and shared components only (DESIGN_SYSTEM.md §26.3, §43).
    files: ['src/**/*.tsx'],
    plugins: { 'vertex-ui': vertexUi },
    rules: {
      'vertex-ui/no-raw-styling': 'error',
      'react/forbid-dom-props': ['error', { forbid: ['style'] }],
    },
  },
  {
    // Documented exception: the design-system lab's token specimens paint each token's own
    // value (colour swatches, spacing bars, radii) and cannot be expressed as utilities.
    files: ['src/dev-ui/token-specimens.tsx'],
    rules: { 'react/forbid-dom-props': 'off' },
  },
];
