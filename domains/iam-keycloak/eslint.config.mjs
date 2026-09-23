import baseConfig, {
  restrictedImportPaths,
  restrictedImportPatterns,
} from '../../eslint.config.mjs';

// The identity-provider adapter may use IAM's private adapter entry, nothing else private, and it
// has no business with the database.
const adapterPaths = [
  ...restrictedImportPaths,
  {
    name: '@vertex-os/database',
    message:
      'The identity-provider adapter talks to Keycloak only; persistence is iam-persistence.',
  },
];
const adapterPatterns = restrictedImportPatterns.map((pattern) =>
  pattern.group.includes('@vertex-os/iam/*')
    ? { ...pattern, group: [...pattern.group, '!@vertex-os/iam/identity-provider'] }
    : pattern,
);

export default [
  ...baseConfig,
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.mjs', '**/*.mts'],
    rules: {
      'no-restricted-imports': ['error', { paths: adapterPaths, patterns: adapterPatterns }],
    },
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
            '{projectRoot}/vitest.config.{js,ts,mjs,mts}',
            '{projectRoot}/src/**/*.spec.ts',
          ],
        },
      ],
    },
  },
  { ignores: ['**/out-tsc'] },
];
