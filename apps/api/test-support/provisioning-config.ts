import {
  loadIdentityProvisioningConfig,
  type IdentityProvisioningConfig,
} from '../src/config/identity-provisioning-config.js';

/**
 * Identity-provisioning configuration for tests that provision nobody. Nothing here is contacted
 * when the application starts: the Keycloak Admin adapter authenticates on its first call.
 */
export function testProvisioningConfig(
  overrides: Readonly<Record<string, string | undefined>> = {},
): IdentityProvisioningConfig {
  return loadIdentityProvisioningConfig({
    NODE_ENV: 'test',
    ...overrides,
  });
}
