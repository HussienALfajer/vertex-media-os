import { describe, expect, it } from 'vitest';
import { loadIdentityProvisioningConfig } from './identity-provisioning-config.js';

describe('local identity compatibility configuration', () => {
  it('has no external identity provider settings', () => {
    expect(loadIdentityProvisioningConfig({})).toEqual({ invitationLifespanSeconds: 43_200 });
  });
});
