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
 * Domain projects will add their own tags and constraints when they exist.
 */
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
    ],
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
          ],
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
