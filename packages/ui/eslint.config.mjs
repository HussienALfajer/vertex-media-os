import nx from '@nx/eslint-plugin';
import baseConfig, { restrictedImportPaths } from '../../eslint.config.mjs';

export default [
  ...nx.configs['flat/react'],
  ...baseConfig,
  {
    // The design system is the one place that wraps its third-party primitives, so the import
    // patterns are dropped here; the createRequire ban still applies.
    rules: { 'no-restricted-imports': ['error', { paths: restrictedImportPaths }] },
  },
];
