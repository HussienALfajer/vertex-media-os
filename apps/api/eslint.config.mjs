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

const IAM_HTTP_CAPABILITIES_ONLY =
  'IAM controllers use the bound capabilities of src/iam; only its composition roots import adapters.';

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

const iamHttpPatterns = [
  ...restrictedImportPatterns,
  {
    group: [
      '@vertex-os/iam-persistence',
      '@vertex-os/audit-persistence',
      '@vertex-os/iam-keycloak',
    ],
    message: IAM_HTTP_CAPABILITIES_ONLY,
  },
];

// The composition roots beside src/iam/http, the database client and the authentication runtime.
const IAM_COMPOSITION_ROOTS = ['administration', 'user-administration', 'directory', 'iam.module'];
const iamHttpCompositionPatterns = [
  {
    regex: String.raw`(^|/)\.\./(${IAM_COMPOSITION_ROOTS.join('|').replaceAll('.', String.raw`\.`)})\.js$`,
    message: IAM_HTTP_CAPABILITIES_ONLY,
  },
  {
    regex: String.raw`(^|/)(database/database\.module|auth/auth-runtime)\.js$|^@vertex-os/database$`,
    message: IAM_HTTP_CAPABILITIES_ONLY,
  },
];

const IAM_HTTP_USER_ACTOR_ONLY =
  "IAM routes attribute changes to the session's USER actor, never to a system process.";

const iamHttpSyntax = [
  ...restrictedImportSyntax,
  ...restrictedEnvSyntax,
  ...restrictedRawSqlSyntax,
  ...adapterImportSyntax.map((rule) => ({ ...rule, message: IAM_HTTP_CAPABILITIES_ONLY })),
  { selector: "Literal[value='SYSTEM']", message: IAM_HTTP_USER_ACTOR_ONLY },
  { selector: "TemplateElement[value.raw='SYSTEM']", message: IAM_HTTP_USER_ACTOR_ONLY },
  { selector: "Identifier[name='systemAttribution']", message: IAM_HTTP_USER_ACTOR_ONLY },
  { selector: "Literal[value='systemAttribution']", message: IAM_HTTP_USER_ACTOR_ONLY },
];

const iamHttpCompositionSyntax = [
  '../administration.js',
  '../user-administration.js',
  '../directory.js',
  '../iam.module.js',
].flatMap((source) => [
  { selector: `ImportExpression[source.value='${source}']`, message: IAM_HTTP_CAPABILITIES_ONLY },
  { selector: `TSImportType[source.value='${source}']`, message: IAM_HTTP_CAPABILITIES_ONLY },
]);

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
    // IAM's inbound transport sees only the bound capabilities (IAM-R07 D-01): neither the private
    // composition entry, an adapter, a composition root, the database client nor the
    // authentication runtime, statically or dynamically; and it never acts as a system process,
    // which the grant ceiling would exempt (IAM-R06 review SEC-1). Tests seed data through them.
    files: ['src/iam/http/**/*.ts'],
    ignores: ['src/iam/http/**/*.spec.ts', 'src/iam/http/capabilities.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: restrictedImportPaths,
          patterns: [...iamHttpPatterns, ...iamHttpCompositionPatterns],
        },
      ],
      'no-restricted-syntax': ['error', ...iamHttpSyntax, ...iamHttpCompositionSyntax],
    },
  },
  {
    // The capability tokens re-export the capability types of the composition roots.
    files: ['src/iam/http/capabilities.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: restrictedImportPaths, patterns: iamHttpPatterns },
      ],
      'no-restricted-syntax': ['error', ...iamHttpSyntax],
    },
  },
  {
    // The entries (the HTTP server and the IAM reference-synchronization and bootstrap commands)
    // are the only production bridges from raw environment variables into the validated
    // AppConfig object. Only the environment selectors are dropped here; the import and
    // raw-SQL selectors still apply.
    files: ['src/main.ts', 'src/commands/iam-sync-reference.ts', 'src/commands/iam-bootstrap.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...restrictedImportSyntax, ...restrictedRawSqlSyntax],
    },
  },
];
