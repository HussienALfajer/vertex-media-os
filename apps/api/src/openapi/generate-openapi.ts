import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createApp } from '../app.factory.js';
import { type AppConfig } from '../config/app-config.js';
import { type AuthConfig } from '../config/auth-config.js';
import { type IdentityProvisioningConfig } from '../config/identity-provisioning-config.js';
import { createOpenApiDocument } from './openapi.js';

/**
 * Writes the OpenAPI document to the path given as the first argument
 * (`pnpm openapi:generate` -> apps/api/generated/openapi.json).
 *
 * The application is created but never listens. The database client connects lazily on its first
 * query, so the placeholder database URL below is never contacted.
 */
const GENERATION_CONFIG: AppConfig = {
  environment: 'development',
  http: { host: '127.0.0.1', port: 0 },
  database: { url: 'postgresql://openapi-generation@127.0.0.1:1/never-connected' },
  logging: { level: 'silent' },
  docs: { enabled: false },
};

const GENERATION_AUTH_CONFIG: AuthConfig = {
  session: {
    idleTimeoutSeconds: 1_800,
    absoluteTimeoutSeconds: 36_000,
    retentionDays: 30,
  },
  rateLimits: { windowSeconds: 60, signIn: 60, logout: 30, evidence: 30 },
};

const GENERATION_PROVISIONING_CONFIG: IdentityProvisioningConfig = {
  invitationLifespanSeconds: 43_200,
};

async function generate(outputPath: string): Promise<void> {
  const app = await createApp(
    GENERATION_CONFIG,
    GENERATION_AUTH_CONFIG,
    GENERATION_PROVISIONING_CONFIG,
  );
  try {
    const document = createOpenApiDocument(app);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    process.stdout.write(`OpenAPI document written to ${outputPath}\n`);
  } finally {
    await app.close();
  }
}

const target = process.argv[2];

if (target === undefined) {
  process.stderr.write('usage: generate-openapi <output-file>\n');
  process.exitCode = 1;
} else {
  generate(resolve(target)).catch((error: unknown) => {
    process.stderr.write(
      `OpenAPI generation failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
