import { defineConfig } from 'vitest/config';

/**
 * API integration tests against a real, ephemeral PostgreSQL started through
 * Testcontainers (Docker required). Executed by `pnpm test:integration`.
 */
export default defineConfig({
  test: {
    name: '@vertex-os/api:integration',
    environment: 'node',
    include: ['src/**/*.integration.spec.ts'],
    watch: false,
    retry: 0,
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
