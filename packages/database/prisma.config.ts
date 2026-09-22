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
} catch {
  // No local .env yet (fresh clone, CI): rely on the process environment only.
}

const databaseUrl = process.env['DATABASE_URL'];

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  ...(databaseUrl ? { datasource: { url: databaseUrl } } : {}),
});
