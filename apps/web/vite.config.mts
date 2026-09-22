/// <reference types="vitest/config" />
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import ts from 'typescript';
import { defaultClientConditions, defineConfig, type Plugin, type ProxyOptions } from 'vite';

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

/**
 * Applies the stored UI preferences (language, direction, theme, density) before the first
 * paint with a blocking, same-origin classic script — compatible with `script-src 'self'`,
 * no inline script (docs/DESIGN_SYSTEM.md §40.1). It is compiled from the same module the
 * React root uses, so the two can never disagree.
 */
function uiBootstrap(): Plugin {
  const source = readFileSync(new URL(import.meta.resolve('@vertex-os/ui/bootstrap')), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      removeComments: true,
    },
  });
  const code = `(function () {\n  var exports = {};\n${outputText}\n  exports.installUiSettings();\n})();\n`;
  const fileName = `assets/ui-bootstrap-${createHash('sha256').update(code).digest('hex').slice(0, 10)}.js`;
  return {
    name: 'vertex-ui-bootstrap',
    configureServer(server) {
      server.middlewares.use(`/${fileName}`, (_request, response) => {
        response.setHeader('Content-Type', 'text/javascript');
        response.end(code);
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName, source: code });
    },
    transformIndexHtml: () => [
      { tag: 'script', attrs: { src: `/${fileName}` }, injectTo: 'head-prepend' },
    ],
  };
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
  // `lab` is the only build that contains the /dev/ui design-system lab (DS-D026). The dev
  // server and tests also resolve the real lab; a production build gets the empty stand-in.
  const lab = mode === 'lab';
  const labEntry = lab || command === 'serve' || mode === 'test' ? 'index.ts' : 'disabled.ts';

  // The browser only ever calls same-origin `/api/...`; no CORS is needed or enabled.
  const proxy: Record<string, ProxyOptions> = { '/api': { target: localApiOrigin() } };

  return {
    root: import.meta.dirname,
    cacheDir: '../../node_modules/.vite/apps/web',
    plugins: [
      uiBootstrap(),
      tanstackRouter({ target: 'react', autoCodeSplitting: true }),
      react(),
      tailwindcss(),
    ],
    // Workspace libraries resolve to their TypeScript sources, as in the TS project references.
    resolve: {
      conditions: ['@vertex-os/source', ...defaultClientConditions],
      alias: { '#design-lab': fileURLToPath(new URL(`./src/dev-ui/${labEntry}`, import.meta.url)) },
    },
    server: {
      host: '127.0.0.1',
      port: Number(process.env['PORT']) || 4200,
      strictPort: true,
      proxy,
    },
    preview: { host: '127.0.0.1', port: lab ? 4310 : 4300, strictPort: true, proxy },
    build: { outDir: lab ? 'dist-lab' : 'dist', emptyOutDir: true },
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
