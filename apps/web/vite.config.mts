/// <reference types="vitest/config" />
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type ProxyOptions } from 'vite';

/**
 * Origin of the local API for the development/preview proxy, taken from `API_HOST` and
 * `API_PORT` (process environment first, then the ignored workspace `.env`).
 *
 * Deliberately not `loadEnv()`: that would also apply `NODE_ENV` from the workspace
 * `.env` to this build. Nothing read here reaches browser code.
 */
function localApiOrigin(): string {
  const envFile = new URL('../../.env', import.meta.url);
  const fromFile = existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {};
  const host = process.env['API_HOST'] ?? fromFile['API_HOST'] ?? '127.0.0.1';
  const port = process.env['API_PORT'] ?? fromFile['API_PORT'] ?? '3000';
  return `http://${host}:${port}`;
}

export default defineConfig(({ command, mode }) => {
  // Vite honours an inherited NODE_ENV, so a stray `NODE_ENV=development` (for example from
  // a `.env` that Nx loads into every task) would silently ship React's development build.
  const nodeEnv = process.env['NODE_ENV'];
  if (command === 'build' && mode === 'production' && nodeEnv !== 'production') {
    throw new Error(
      `Refusing to create a production build with NODE_ENV=${nodeEnv}; unset NODE_ENV (see .env.example).`,
    );
  }

  // The browser only ever calls same-origin `/api/...`; no CORS is needed or enabled.
  const proxy: Record<string, ProxyOptions> = { '/api': { target: localApiOrigin() } };

  return {
    root: import.meta.dirname,
    cacheDir: '../../node_modules/.vite/apps/web',
    plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()],
    server: { host: '127.0.0.1', port: 4200, strictPort: true, proxy },
    preview: { host: '127.0.0.1', port: 4300, strictPort: true, proxy },
    build: { outDir: 'dist', emptyOutDir: true },
    test: {
      name: '@vertex-os/web',
      environment: 'jsdom',
      include: ['src/**/*.spec.{ts,tsx}'],
      setupFiles: ['src/test-setup.ts'],
      watch: false,
      retry: 0,
    },
  };
});
