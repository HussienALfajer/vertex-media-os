import {
  loadIdentityProvisioningConfig,
  type IdentityProvisioningConfig,
} from '../src/config/identity-provisioning-config.js';

/**
 * Compatibility configuration for tests using IAM's local identity adapter. No external
 * service is contacted when the application starts.
 */
export function testProvisioningConfig(
  overrides: Readonly<Record<string, string | undefined>> = {},
): IdentityProvisioningConfig {
  return loadIdentityProvisioningConfig({
    NODE_ENV: 'test',
    ...overrides,
  });
}
