import { defineConfig } from 'vitest/config';

/**
 * Integration tests run against a real, ephemeral PostgreSQL started through
 * Testcontainers (Docker required). They are deliberately separate from the
 * fast unit suite and are executed by `pnpm test:integration`.
 */
export default defineConfig({
  test: {
    name: '@vertex-os/database:integration',
    environment: 'node',
    include: ['src/**/*.integration.spec.ts'],
    watch: false,
    retry: 0,
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
