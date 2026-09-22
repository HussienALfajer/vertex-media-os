import baseConfig from '../../eslint.config.mjs';

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
          ],
        },
      ],
    },
  },
  {
    ignores: ['**/out-tsc', 'generated'],
  },
  {
    // The API bootstrap is the sole production bridge from raw environment
    // variables into the validated AppConfig object.
    files: ['src/main.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
];
