import { ConfigurationError, loadAppConfig } from '../config/app-config.js';
import { loadIdentityProvisioningConfig } from '../config/identity-provisioning-config.js';
import { safeErrorSerializer } from '../logging/safe-error-serializer.js';
import { EXIT_FAILED, runIamBootstrap } from './iam-bootstrap.command.js';

/**
 * `pnpm iam:bootstrap`: the operator command that creates the first System Administrator (spec
 * Section 21). Like `main.ts`, this entry is a raw-environment bridge: it maps the environment to
 * typed configuration once and passes it on, together with the operator's arguments.
 */
async function run(): Promise<void> {
  const config = loadAppConfig(process.env);
  const provisioning = loadIdentityProvisioningConfig(process.env);
  process.exitCode = await runIamBootstrap(config, provisioning, process.argv.slice(2));
}

run().catch((error: unknown) => {
  // The structured logger may not exist yet (invalid configuration), so report on stderr.
  // ConfigurationError names variables only, never their values.
  const reason =
    error instanceof ConfigurationError
      ? error.message
      : `IAM bootstrap failed to start: ${JSON.stringify(safeErrorSerializer(error))}`;
  process.stderr.write(`${reason}\n`);
  process.exitCode = EXIT_FAILED;
});
