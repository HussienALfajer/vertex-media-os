import playwright from 'eslint-plugin-playwright';
import baseConfig, { restrictedImportPatterns } from '../../eslint.config.mjs';

export default [
  playwright.configs['flat/recommended'],
  ...baseConfig,
  {
    ignores: ['**/out-tsc', 'test-output'],
  },
  {
    // The visual-browser setup resolves Playwright's installed package with createRequire; this
    // black-box project imports no workspace code, so only the createRequire ban is dropped.
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.mjs', '**/*.mts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: restrictedImportPatterns }],
    },
  },
];
