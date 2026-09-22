import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@vertex-os/ui',
    environment: 'jsdom',
    include: ['src/**/*.spec.{ts,tsx}', 'scripts/**/*.spec.mjs', 'lint/**/*.spec.mjs'],
    setupFiles: ['src/test-setup.ts'],
    watch: false,
    retry: 0,
  },
});
