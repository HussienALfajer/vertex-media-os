import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@vertex-os/iam-persistence:integration',
    environment: 'node',
    include: ['src/**/*.integration.spec.ts'],
    watch: false,
    retry: 0,
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
