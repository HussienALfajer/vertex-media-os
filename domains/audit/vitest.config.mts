import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@vertex-os/audit',
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    watch: false,
    retry: 0,
  },
});
