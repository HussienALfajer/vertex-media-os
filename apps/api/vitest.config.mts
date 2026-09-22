import { defineConfig } from 'vitest/config';

/**
 * Fast unit and API tests. API tests run the real Nest/Fastify application
 * through Fastify `inject` (no listening socket, no PostgreSQL). Decorator
 * metadata required by Nest dependency injection is emitted by Vite's Oxc
 * transform from the `experimentalDecorators`/`emitDecoratorMetadata` options
 * in tsconfig.spec.json.
 */
export default defineConfig({
  test: {
    name: '@vertex-os/api',
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    exclude: ['src/**/*.integration.spec.ts'],
    watch: false,
    retry: 0,
  },
});
