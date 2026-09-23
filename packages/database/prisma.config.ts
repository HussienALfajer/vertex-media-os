import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 configuration for the Vertex OS database package.
 *
 * The Prisma CLI does not load `.env` files itself. The workspace keeps one
 * ignored `.env` at the repository root (created by `pnpm env:setup`), so it is
 * loaded here with Node's built-in loader when present. `DATABASE_URL` is only
 * required for commands that talk to a database (migrations, introspection);
 * `prisma validate` and `prisma generate` work without it.
 */
const workspaceEnvFile = new URL('../../.env', import.meta.url);

try {
  process.loadEnvFile(workspaceEnvFile);
} catch (error) {
  // Only a missing file is expected (fresh clone, CI): then the process environment is used as is.
  // Anything else (unreadable file, a directory in its place, …) must fail loudly rather than
  // silently running Prisma without the developer's configuration.
  if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
    throw error;
  }
}

const databaseUrl = process.env['DATABASE_URL'];

export default defineConfig({
  schema: 'prisma/schema',
  migrations: {
    path: 'prisma/migrations',
  },
  ...(databaseUrl ? { datasource: { url: databaseUrl } } : {}),
});
