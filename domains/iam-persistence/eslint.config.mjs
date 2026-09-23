import baseConfig, { restrictedImportPatterns } from '../../eslint.config.mjs';

const adapterPatterns = restrictedImportPatterns.map((pattern) =>
  pattern.group.includes('@vertex-os/iam/*')
    ? {
        ...pattern,
        group: [...pattern.group, '!@vertex-os/iam/persistence', '!@vertex-os/database/iam'],
      }
    : pattern,
);

export default [
  ...baseConfig,
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.mjs', '**/*.mts'],
    rules: { 'no-restricted-imports': ['error', { patterns: adapterPatterns }] },
  },
  {
    files: ['**/*.json'],
    languageOptions: { parser: await import('jsonc-eslint-parser') },
    rules: {
      '@nx/dependency-checks': [
        'error',
        {
          ignoredFiles: [
            '{projectRoot}/eslint.config.{js,cjs,mjs,ts,cts,mts}',
            '{projectRoot}/vitest.integration.config.{js,ts,mjs,mts}',
            '{projectRoot}/src/**/*.spec.ts',
            '{projectRoot}/test-support/**/*.ts',
          ],
        },
      ],
    },
  },
  { ignores: ['**/out-tsc'] },
];
