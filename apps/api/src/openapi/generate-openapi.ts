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
 * The application is created but never listens, the database client connects lazily on first
 * query, OIDC discovery happens on the first sign-in, and the Keycloak Admin adapter authenticates
 * on its first call, so the placeholders below are never contacted.
 */
const GENERATION_CONFIG: AppConfig = {
  environment: 'development',
  http: { host: '127.0.0.1', port: 0 },
  database: { url: 'postgresql://openapi-generation@127.0.0.1:1/never-connected' },
  logging: { level: 'silent' },
  docs: { enabled: false },
};

const GENERATION_AUTH_CONFIG: AuthConfig = {
  oidc: {
    issuer: 'http://127.0.0.1:1/realms/never-contacted',
    clientId: 'vertex-web',
    clientSecret: 'openapi-generation-placeholder',
    redirectUri: 'http://127.0.0.1:1/api/auth/callback',
    postLogoutRedirectUri: 'http://127.0.0.1:1/',
    allowInsecureRequests: true,
  },
  session: {
    idleTimeoutSeconds: 1_800,
    absoluteTimeoutSeconds: 36_000,
    loginAttemptTimeoutSeconds: 600,
  },
  tokenEncryptionSecret: 'openapi-generation-placeholder-secret-0000',
};

const GENERATION_PROVISIONING_CONFIG: IdentityProvisioningConfig = {
  issuer: 'http://127.0.0.1:1/realms/never-contacted',
  provisioner: {
    clientId: 'vertex-provisioner',
    clientSecret: 'openapi-generation-placeholder',
  },
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
