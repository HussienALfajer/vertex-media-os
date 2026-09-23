import baseConfig, {
  restrictedEnvSyntax,
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

// The composition roots bind IAM's use cases to adapters (IAM-R04 D-12); they alone may reach
// IAM's private composition entry.
const compositionPatterns = restrictedImportPatterns.map((pattern) =>
  pattern.group.includes('@vertex-os/iam/*')
    ? { ...pattern, group: [...pattern.group, '!@vertex-os/iam/composition'] }
    : pattern,
);

const ADAPTERS_ONLY_IN_RUNTIME =
  'Only auth-runtime.ts composes adapters; use the bound capabilities of AuthRuntime.';

// `no-restricted-imports` sees static imports only; dynamic imports and type queries of the
// adapters are closed by syntax (IAM-CP1 CP1-03).
const adapterImportSyntax = [
  '@vertex-os/iam-persistence',
  '@vertex-os/audit-persistence',
  '@vertex-os/iam-keycloak',
]
  .flatMap((name) => [
    `ImportExpression[source.value='${name}']`,
    `TSImportType[source.value='${name}']`,
  ])
  .map((selector) => ({ selector, message: ADAPTERS_ONLY_IN_RUNTIME }));

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
    // Only the area's composition root wires adapters; everything else in it reaches IAM and Audit
    // through bound capabilities (IAM-R03 review F1). Tests seed data through the adapters.
    files: ['src/auth/**/*.ts'],
    ignores: ['src/auth/auth-runtime.ts', 'src/auth/**/*.spec.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: restrictedImportPaths,
          patterns: [
            ...authAreaPatterns,
            {
              group: [
                '@vertex-os/iam-persistence',
                '@vertex-os/audit-persistence',
                '@vertex-os/iam-keycloak',
              ],
              message: ADAPTERS_ONLY_IN_RUNTIME,
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        ...restrictedImportSyntax,
        ...restrictedEnvSyntax,
        ...restrictedRawSqlSyntax,
        ...adapterImportSyntax,
      ],
    },
  },
  {
    files: ['src/iam/**/*.ts', 'src/commands/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: restrictedImportPaths, patterns: compositionPatterns },
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
