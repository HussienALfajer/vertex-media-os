import baseConfig, {
  restrictedImportPaths,
  restrictedImportPatterns,
  restrictedImportSyntax,
  restrictedRawSqlSyntax,
} from '../../eslint.config.mjs';

// The authentication area owns the platform session tables (IAM-R03 D-01); it alone may reach
// their scoped persistence entry.
const authAreaPatterns = restrictedImportPatterns.map((pattern) =>
  pattern.group.includes('@vertex-os/database/*')
    ? { ...pattern, group: [...pattern.group, '!@vertex-os/database/auth'] }
    : pattern,
);

export default [
  ...baseConfig,
  {
    files: ['**/*.json'],
    languageOptions: {
      parser: await import('jsonc-eslint-parser'),
    },
    rules: {
      '@nx/dependency-checks': [
        'error',
        {
          // Required peer dependencies of @nestjs/* that application code never imports directly.
          ignoredDependencies: ['reflect-metadata', 'rxjs', '@fastify/static'],
          ignoredFiles: [
            '{projectRoot}/eslint.config.{js,cjs,mjs,ts,cts,mts}',
            '{projectRoot}/vitest.config.{js,ts,mjs,mts}',
            '{projectRoot}/vitest.integration.config.{js,ts,mjs,mts}',
            '{projectRoot}/src/**/*.spec.ts',
            '{projectRoot}/test-support/**/*.ts',
          ],
        },
      ],
    },
  },
  {
    ignores: ['**/out-tsc', 'generated'],
  },
  {
    files: ['src/auth/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: restrictedImportPaths, patterns: authAreaPatterns },
      ],
    },
  },
  {
    // The two bootstrap entries (the HTTP server and the IAM reference-synchronization command)
    // are the only production bridges from raw environment variables into the validated
    // AppConfig object. Only the environment selectors are dropped here; the import and
    // raw-SQL selectors still apply.
    files: ['src/main.ts', 'src/commands/iam-sync-reference.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...restrictedImportSyntax, ...restrictedRawSqlSyntax],
    },
  },
];
