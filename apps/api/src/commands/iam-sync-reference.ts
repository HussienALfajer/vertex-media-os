import { ConfigurationError, loadAppConfig } from '../config/app-config.js';
import { safeErrorSerializer } from '../logging/safe-error-serializer.js';
import { EXIT_FAILED, runIamReferenceSync } from './iam-sync-reference.command.js';

/**
 * `pnpm iam:sync-reference`: the operator command that synchronizes IAM reference data. Like
 * `main.ts`, this entry is a raw-environment bridge: it maps the environment to typed AppConfig
 * once and passes it on.
 */
async function run(): Promise<void> {
  const config = loadAppConfig(process.env);
  process.exitCode = await runIamReferenceSync(config);
}

run().catch((error: unknown) => {
  // The structured logger may not exist yet (invalid configuration), so report on stderr.
  // ConfigurationError names variables only, never their values.
  const reason =
    error instanceof ConfigurationError
      ? error.message
      : `IAM reference synchronization failed to start: ${JSON.stringify(safeErrorSerializer(error))}`;
  process.stderr.write(`${reason}\n`);
  process.exitCode = EXIT_FAILED;
});
