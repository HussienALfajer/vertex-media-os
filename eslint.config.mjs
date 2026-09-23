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
      '**/domains/iam/src/**',
      '**/domains/iam-persistence/src/**',
    ],
    message: 'Import persistence internals only through approved root entry points.',
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
              onlyDependOnLibsWithTags: ['domain:iam', 'layer:infrastructure', 'layer:shared'],
            },
          ],
        },
      ],
    },
  },
  {
    // Production source receives typed configuration from the API bootstrap.
    // Test setup, CLI tooling and the one bootstrap read are outside this selector.
    files: ['**/src/**/*.{ts,tsx,js,jsx}'],
    ignores: ['**/*.{spec,test}.{ts,tsx,js,jsx}', '**/src/test-setup.{ts,tsx,js,jsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
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
