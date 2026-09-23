import nx from '@nx/eslint-plugin';

/**
 * Workspace-wide ESLint configuration. Project-level `eslint.config.mjs` files
 * extend this one.
 *
 * Project tags drive the architecture boundaries below (see each project's
 * `package.json` → `nx.tags`):
 *   - `type:app`      runtime applications (may depend on libraries only)
 *   - `type:lib`      reusable libraries
 *   - `type:e2e`      black-box end-to-end test projects (may depend on no project)
 *   - `scope:backend` backend/server-side code (may use Node, Nest, Prisma)
 *   - `scope:web`     browser code (must never import backend/database code)
 *   - `layer:infrastructure` technical infrastructure such as `packages/database`
 *   - `layer:ui`      the business-neutral design system `packages/ui` (no router, query,
 *                     application or domain dependencies)
 *   - `layer:domain` backend business core (no infrastructure/framework imports)
 *   - `layer:adapter` domain-owned infrastructure implementing private ports (persistence, and
 *                    IAM's identity-provider adapter)
 *   - `layer:shared` reserved for a future domain-neutral shared kernel (unused today)
 *   - `domain:iam`   the IAM ownership boundary
 *   - `domain:audit` the MOD-AUDIT ownership boundary; other domains may depend on its public
 *                    root only, and it never depends on another domain
 */
export const restrictedImportPatterns = [
  {
    group: ['@base-ui/*', '@floating-ui/*'],
    message: 'Import the Vertex component from @vertex-os/ui; primitives are internal to it.',
  },
  {
    group: ['@vertex-os/ui/*', '!@vertex-os/ui/styles.css'],
    message: 'Import from the @vertex-os/ui entry point only.',
  },
  {
    group: [
      '@vertex-os/iam/*',
      '@vertex-os/database/*',
      '@vertex-os/iam-persistence/*',
      '@vertex-os/iam-keycloak/*',
      '@vertex-os/audit/*',
      '@vertex-os/audit-persistence/*',
      '**/domains/iam/src/**',
      '**/domains/iam-persistence/src/**',
      '**/domains/iam-keycloak/src/**',
      '**/domains/audit/src/**',
      '**/domains/audit-persistence/src/**',
    ],
    message: 'Import persistence internals only through approved root entry points.',
  },
];

/**
 * `node:module` (its `createRequire`) resolves any specifier at run time and so bypasses every
 * import restriction. Only the black-box end-to-end project (`apps/web-e2e`) uses it, and its
 * configuration drops these paths; `restrictedImportSyntax` closes the dynamic routes to it.
 */
const CREATE_REQUIRE_MESSAGE = 'createRequire bypasses the import boundaries; use a static import.';

export const restrictedImportPaths = ['node:module', 'module'].map((name) => ({
  name,
  message: CREATE_REQUIRE_MESSAGE,
}));

/**
 * Matches a member or key written as an identifier, a string literal or a plain template literal,
 * for example `x.env`, `x['env']` and `` x[`env`] ``.
 */
const named = (attribute, name) =>
  `:matches([${attribute}.name='${name}'], [${attribute}.value='${name}'], [${attribute}.quasis.0.value.raw='${name}'])`;

const PRIVATE_SUBPATH_MESSAGE =
  'Import @vertex-os packages statically and only through their approved entry points; dynamic imports and type queries of subpaths bypass the entry-point restriction.';

/**
 * `no-restricted-imports` sees only static import/export declarations. These selectors close the
 * remaining ways to name a module: dynamic `import()` and `import('…')` type queries of
 * `@vertex-os/<package>/<subpath>`, template-literal specifiers, computed (unanalyzable)
 * specifiers, and every route to `createRequire`. Applied to every linted file; no project negates
 * them.
 */
export const restrictedImportSyntax = [
  {
    selector:
      "ImportExpression[source.type='Literal'][source.value=/^@vertex-os\\u002F[^\\u002F]+\\u002F./]",
    message: PRIVATE_SUBPATH_MESSAGE,
  },
  {
    selector: 'ImportExpression > TemplateLiteral.source[quasis.0.value.raw=/^@vertex-os\\u002F/]',
    message: PRIVATE_SUBPATH_MESSAGE,
  },
  {
    selector: "ImportExpression[source.type!='Literal'][source.type!='TemplateLiteral']",
    message: 'Use a static module specifier; computed dynamic imports cannot be checked.',
  },
  {
    // An interpolated template can assemble any specifier, including a private subpath.
    selector: 'ImportExpression > TemplateLiteral.source[expressions.length>0]',
    message: 'Use a static module specifier; computed dynamic imports cannot be checked.',
  },
  {
    selector: 'TSImportType[source.value=/^@vertex-os\\u002F[^\\u002F]+\\u002F./]',
    message: PRIVATE_SUBPATH_MESSAGE,
  },
  ...[
    'ImportExpression[source.value=/^(node:)?module$/]',
    'ImportExpression > TemplateLiteral.source[quasis.0.value.raw=/^(node:)?module$/]',
    'TSExternalModuleReference[expression.value=/^(node:)?module$/]',
    `MemberExpression${named('property', 'createRequire')}`,
    `CallExpression${named('callee.property', 'getBuiltinModule')}`,
  ].map((selector) => ({ selector, message: CREATE_REQUIRE_MESSAGE })),
];

const RAW_ENVIRONMENT_MESSAGE =
  'Read raw environment variables only in the API bootstrap and pass typed AppConfig to production code.';

/**
 * Production source receives typed configuration from a bootstrap entry, never `process.env`:
 * not through `process`, `globalThis.process` or any other member named `process` (dot, bracket
 * or template form), not by destructuring, and not through any import or re-export of
 * `node:process`. Aliasing `process` or `Reflect.get` cannot be closed by syntax; they are
 * deliberate circumvention that review rejects.
 */
export const restrictedEnvSyntax = [
  `MemberExpression${named('property', 'env')}:matches([object.name='process'], [object.property.name='process'], [object.property.value='process'], [object.property.quasis.0.value.raw='process'])`,
  `VariableDeclarator:matches([init.name='process'], [init.property.name='process'], [init.property.value='process']) > ObjectPattern > Property${named('key', 'env')}`,
  `Property${named('key', 'process')} > ObjectPattern > Property${named('key', 'env')}`,
  ':matches(ImportDeclaration, ExportNamedDeclaration, ExportAllDeclaration, ImportExpression)[source.value=/^(node:)?process$/]',
  'ImportExpression > TemplateLiteral.source[quasis.0.value.raw=/^(node:)?process$/]',
  'TSExternalModuleReference[expression.value=/^(node:)?process$/]',
].map((selector) => ({ selector, message: RAW_ENVIRONMENT_MESSAGE }));

/**
 * Unsafe raw SQL (string-built queries) is for tests only; production uses tagged `$queryRaw`.
 * Covers dot, bracket, template and destructuring access.
 */
export const restrictedRawSqlSyntax = [
  ['$queryRawUnsafe', '$queryRaw'],
  ['$executeRawUnsafe', '$executeRaw'],
].flatMap(([unsafe, tagged]) => {
  const message = `Use the tagged ${tagged} template; ${unsafe} is reserved for tests.`;
  return [
    { selector: `MemberExpression${named('property', unsafe)}`, message },
    { selector: `ObjectPattern > Property${named('key', unsafe)}`, message },
  ];
});

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: [
      '**/dist',
      '**/out-tsc',
      '**/test-output',
      '**/vite.config.*.timestamp*',
      '**/vitest.config.*.timestamp*',
      'apps/api/generated',
      'packages/database/src/generated',
      'apps/web/src/routeTree.gen.ts',
      '**/dist-lab',
    ],
  },
  {
    // The design system's third-party primitives and internals stay behind its public API.
    // packages/ui (the only permitted user) switches this off in its own config.
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.mjs', '**/*.mts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: restrictedImportPaths,
          patterns: restrictedImportPatterns,
        },
      ],
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\.base)?\.config\.[cm]?[jt]s$'],
          depConstraints: [
            {
              sourceTag: 'layer:ui',
              onlyDependOnLibsWithTags: ['layer:ui'],
              bannedExternalImports: ['@tanstack/react-query', '@tanstack/react-router'],
            },
            {
              sourceTag: 'type:app',
              onlyDependOnLibsWithTags: ['type:lib'],
            },
            {
              sourceTag: 'type:lib',
              onlyDependOnLibsWithTags: ['type:lib'],
            },
            {
              // End-to-end tests exercise the running system as a black box.
              sourceTag: 'type:e2e',
              onlyDependOnLibsWithTags: [],
            },
            {
              sourceTag: 'scope:web',
              onlyDependOnLibsWithTags: ['scope:web'],
              // Browser code must never reach persistence or server frameworks, even via npm.
              bannedExternalImports: [
                'prisma',
                '@prisma/*',
                'pg',
                '@nestjs/*',
                'fastify',
                '@fastify/*',
                'testcontainers',
                '@testcontainers/*',
              ],
            },
            {
              sourceTag: 'scope:backend',
              onlyDependOnLibsWithTags: ['scope:backend'],
            },
            {
              sourceTag: 'layer:infrastructure',
              onlyDependOnLibsWithTags: ['layer:infrastructure'],
            },
            {
              sourceTag: 'layer:domain',
              onlyDependOnLibsWithTags: ['layer:domain', 'layer:shared'],
              bannedExternalImports: [
                '@nestjs/*',
                '@prisma/*',
                'prisma',
                'pg',
                'fastify',
                '@fastify/*',
                'react',
                'react-dom',
                '@tanstack/*',
                'vite',
                '@vitejs/*',
                '@keycloak/*',
                'keycloak-*',
              ],
            },
            {
              sourceTag: 'layer:adapter',
              onlyDependOnLibsWithTags: ['layer:domain', 'layer:infrastructure', 'layer:shared'],
              bannedExternalImports: [
                '@prisma/*',
                'prisma',
                'pg',
                '@nestjs/*',
                'fastify',
                '@fastify/*',
                'react',
                'react-dom',
                '@tanstack/*',
                'vite',
                '@vitejs/*',
              ],
            },
            {
              sourceTag: 'domain:iam',
              onlyDependOnLibsWithTags: [
                'domain:iam',
                'domain:audit',
                'layer:infrastructure',
                'layer:shared',
              ],
            },
            {
              sourceTag: 'domain:audit',
              onlyDependOnLibsWithTags: ['domain:audit', 'layer:infrastructure', 'layer:shared'],
            },
          ],
        },
      ],
    },
  },
  {
    // A later configuration object replaces an earlier one's options for the same rule, so every
    // `no-restricted-syntax` value below is composed explicitly from the exported selector lists.
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.js',
      '**/*.jsx',
      '**/*.mjs',
      '**/*.mts',
      '**/*.cjs',
      '**/*.cts',
    ],
    rules: { 'no-restricted-syntax': ['error', ...restrictedImportSyntax] },
  },
  {
    // Production source receives typed configuration from the API bootstrap and never builds SQL
    // strings. Test setup, CLI tooling and the bootstrap entries are outside this selector.
    files: ['**/src/**/*.{ts,tsx,js,jsx}'],
    ignores: ['**/*.{spec,test}.{ts,tsx,js,jsx}', '**/src/test-setup.{ts,tsx,js,jsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...restrictedImportSyntax,
        ...restrictedEnvSyntax,
        ...restrictedRawSqlSyntax,
      ],
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.cts', '**/*.mts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
    },
  },
];
