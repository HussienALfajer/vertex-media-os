import baseConfig, {
  restrictedImportPaths,
  restrictedImportPatterns,
} from '../../eslint.config.mjs';

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
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: restrictedImportPaths, patterns: adapterPatterns },
      ],
    },
  },
  {
    // Tests drive IAM's use cases against the real adapters (IAM-R04 D-12).
    files: ['src/**/*.spec.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: restrictedImportPaths,
          patterns: adapterPatterns.map((pattern) =>
            pattern.group.includes('@vertex-os/iam/*')
              ? { ...pattern, group: [...pattern.group, '!@vertex-os/iam/composition'] }
              : pattern,
          ),
        },
      ],
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
