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
 *   - `layer:adapter` domain-owned persistence infrastructure implementing private ports
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
      '@vertex-os/audit/*',
      '@vertex-os/audit-persistence/*',
      '**/domains/iam/src/**',
      '**/domains/iam-persistence/src/**',
      '**/domains/audit/src/**',
      '**/domains/audit-persistence/src/**',
    ],
    message: 'Import persistence internals only through approved root entry points.',
  },
];

const PRIVATE_SUBPATH_MESSAGE =
  'Import @vertex-os packages statically and only through their approved entry points; dynamic imports and type queries of subpaths bypass the entry-point restriction.';

/**
 * `no-restricted-imports` sees only static import/export declarations. These selectors close the
 * remaining ways to name a module: dynamic `import()` and `import('…')` type queries of
 * `@vertex-os/<package>/<subpath>`, template-literal specifiers, and computed (unanalyzable)
 * specifiers. Applied to every linted file; no project negates them.
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
    selector: 'TSImportType[source.value=/^@vertex-os\\u002F[^\\u002F]+\\u002F./]',
    message: PRIVATE_SUBPATH_MESSAGE,
  },
];

/** Production source receives typed configuration from a bootstrap entry, never `process.env`. */
export const restrictedEnvSyntax = [
  {
    selector: "MemberExpression[object.name='process'][property.name='env']",
    message:
      'Read raw environment variables only in the API bootstrap and pass typed AppConfig to production code.',
  },
  {
    selector: "MemberExpression[object.name='process'][property.value='env']",
    message:
      'Read raw environment variables only in the API bootstrap and pass typed AppConfig to production code.',
  },
];

/** Unsafe raw SQL (string-built queries) is for tests only; production uses tagged `$queryRaw`. */
export const restrictedRawSqlSyntax = [
  {
    selector: "MemberExpression[property.name='$queryRawUnsafe']",
    message: 'Use the tagged $queryRaw template; $queryRawUnsafe is reserved for tests.',
  },
  {
    selector: "MemberExpression[property.name='$executeRawUnsafe']",
    message: 'Use the tagged $executeRaw template; $executeRawUnsafe is reserved for tests.',
  },
];

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
