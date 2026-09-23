import { describe, expect, it } from 'vitest';
import { ConfigurationError } from './app-config.js';
import { loadIdentityProvisioningConfig } from './identity-provisioning-config.js';

const SECRET = 'sentinel-provisioner-secret-value';

const valid = {
  KEYCLOAK_ISSUER_URL: 'http://127.0.0.1:8080/realms/vertex',
  KEYCLOAK_PROVISIONER_CLIENT_ID: 'vertex-provisioner',
  KEYCLOAK_PROVISIONER_CLIENT_SECRET: SECRET,
};

function problems(source: Record<string, string | undefined>): string {
  try {
    loadIdentityProvisioningConfig(source);
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigurationError);
    return (error as Error).message;
  }
  throw new Error('expected a configuration error');
}

describe('loadIdentityProvisioningConfig', () => {
  it('maps the provisioning values with the default invitation lifespan', () => {
    expect(loadIdentityProvisioningConfig(valid)).toEqual({
      issuer: 'http://127.0.0.1:8080/realms/vertex',
      provisioner: { clientId: 'vertex-provisioner', clientSecret: SECRET },
      invitationLifespanSeconds: 43_200,
    });
    expect(
      loadIdentityProvisioningConfig({ ...valid, KEYCLOAK_INVITATION_LIFESPAN_SECONDS: '3600' })
        .invitationLifespanSeconds,
    ).toBe(3600);
  });

  it('requires every value and names the missing variables', () => {
    const message = problems({});
    for (const name of [
      'KEYCLOAK_ISSUER_URL',
      'KEYCLOAK_PROVISIONER_CLIENT_ID',
      'KEYCLOAK_PROVISIONER_CLIENT_SECRET',
    ]) {
      expect(message).toContain(name);
    }
  });

  it('accepts only a realm issuer, and only https in production', () => {
    for (const issuer of [
      'http://127.0.0.1:8080',
      'http://host/realms/',
      'not a url',
      'ftp://h/realms/v',
    ]) {
      expect(problems({ ...valid, KEYCLOAK_ISSUER_URL: issuer })).toContain('KEYCLOAK_ISSUER_URL');
    }
    expect(problems({ ...valid, NODE_ENV: 'production' })).toContain(
      'must use https in production',
    );
    expect(
      loadIdentityProvisioningConfig({
        ...valid,
        NODE_ENV: 'production',
        KEYCLOAK_ISSUER_URL: 'https://id.example.test/realms/vertex',
      }).issuer,
    ).toBe('https://id.example.test/realms/vertex');
  });

  it('bounds the invitation lifespan', () => {
    for (const lifespan of ['299', '604801', '1.5', 'soon']) {
      expect(problems({ ...valid, KEYCLOAK_INVITATION_LIFESPAN_SECONDS: lifespan })).toContain(
        'KEYCLOAK_INVITATION_LIFESPAN_SECONDS',
      );
    }
  });

  it('never echoes a secret or an issuer value in its errors', () => {
    const message = problems({
      ...valid,
      KEYCLOAK_PROVISIONER_CLIENT_SECRET: 'short-secret',
      KEYCLOAK_ISSUER_URL: 'http://sentinel-issuer.test/no-realm',
    });
    expect(message).toContain('KEYCLOAK_PROVISIONER_CLIENT_SECRET');
    expect(message).not.toContain('short-secret');
    expect(message).not.toContain('sentinel-issuer');
  });
});
