import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { parseTraceId } from '@vertex-os/audit';
import { createDatabaseClient } from '@vertex-os/database';
import { iamPermissionManifest } from '@vertex-os/iam';
import { hashPassword, validPassword } from '../auth/passwords.js';
import { ConfigurationError, loadAppConfig } from '../config/app-config.js';
import { loadIdentityProvisioningConfig } from '../config/identity-provisioning-config.js';
import {
  createIamBootstrap,
  createIamMigratedAdministratorRecovery,
} from '../iam/user-administration.js';
import { safeErrorSerializer } from '../logging/safe-error-serializer.js';

/** Explicit operator action; never a default account or password in source control. */
async function run(): Promise<number> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    strict: true,
    allowPositionals: true,
    options: {
      email: { type: 'string' },
      'recover-migrated-admin': { type: 'boolean' },
      reason: { type: 'string' },
    },
  });
  const password = process.env['IAM_BOOTSTRAP_PASSWORD'];
  const recovering = values['recover-migrated-admin'] === true;
  if (
    positionals.length > 0 ||
    !values.email ||
    !validPassword(password) ||
    (recovering ? !values.reason : values.reason !== undefined)
  ) {
    process.stderr.write(
      'Usage: IAM_BOOTSTRAP_PASSWORD=<secret> pnpm iam:bootstrap --email <address> [--recover-migrated-admin --reason <reason>]\n',
    );
    return 64;
  }
  const config = loadAppConfig(process.env);
  const database = createDatabaseClient({ connectionString: config.database.url });
  try {
    const traceId = parseTraceId(randomUUID());
    if (!traceId.ok) throw new Error('Invalid bootstrap attribution.');
    const options = {
      revokeUserSessions: async () => 0,
    };
    const provisioning = loadIdentityProvisioningConfig(process.env);
    const passwordHash = await hashPassword(password);
    const result = recovering
      ? await createIamMigratedAdministratorRecovery(
          provisioning,
          database,
          options,
        )({
          email: values.email,
          passwordHash,
          reason: values.reason ?? '',
          manifests: [iamPermissionManifest],
          traceId: traceId.value,
        })
      : await createIamBootstrap(
          provisioning,
          database,
          options,
        )({
          mode: 'normal',
          email: values.email,
          displayName: values.email,
          passwordHash,
          manifests: [iamPermissionManifest],
          traceId: traceId.value,
        });
    if (
      result.outcome !== 'created' &&
      result.outcome !== 'resumed' &&
      result.outcome !== 'recovered'
    ) {
      const reason =
        result.outcome === 'refused'
          ? result.reason
          : result.outcome === 'invalid'
            ? result.field
            : result.outcome;
      process.stderr.write(`Local administrator bootstrap refused: ${reason}.\n`);
      return 2;
    }
    process.stdout.write(`Local administrator ${result.outcome}: ${result.userId}.\n`);
    return 0;
  } finally {
    await database.disconnect();
  }
}

run()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    const reason =
      error instanceof ConfigurationError ? error.message : safeErrorSerializer(error).message;
    process.stderr.write(`Local administrator bootstrap failed: ${reason}\n`);
    process.exitCode = 1;
  });
