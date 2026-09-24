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
    // Authentication state never enters browser storage (spec Section 40; IAM-R08 D-14). The
    // only credential is the API's HttpOnly cookie; UI preferences live in @vertex-os/ui.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/**/*.spec.{ts,tsx}', 'src/test-setup.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...['localStorage', 'sessionStorage', 'indexedDB'].map((name) => ({
          name,
          message: 'Application code keeps no state in browser storage (IAM-R08 D-14).',
        })),
      ],
      'no-restricted-properties': [
        'error',
        ...['localStorage', 'sessionStorage', 'indexedDB'].map((property) => ({
          object: 'window',
          property,
          message: 'Application code keeps no state in browser storage (IAM-R08 D-14).',
        })),
        {
          object: 'document',
          property: 'cookie',
          message: 'The session cookie is HttpOnly; browser code never reads or writes cookies.',
        },
      ],
    },
  },
  {
    // Documented exception: the design-system lab's token specimens paint each token's own
    // value (colour swatches, spacing bars, radii) and cannot be expressed as utilities.
    files: ['src/dev-ui/token-specimens.tsx'],
    rules: { 'react/forbid-dom-props': 'off' },
  },
];
