import { describe, expect, it } from 'vitest';
import { TEST_AUTH_ENVIRONMENT } from '../../test-support/auth-config.js';
import { ConfigurationError } from './app-config.js';
import { loadAuthConfig } from './auth-config.js';

describe('local authentication configuration', () => {
  it('uses bounded session and rate limits without an identity provider', () => {
    expect(loadAuthConfig(TEST_AUTH_ENVIRONMENT)).toEqual({
      session: {
        idleTimeoutSeconds: 1_800,
        absoluteTimeoutSeconds: 36_000,
        loginAttemptTimeoutSeconds: 600,
        retentionDays: 30,
      },
      rateLimits: { windowSeconds: 60, signIn: 10, logout: 30, evidence: 30 },
      tokenEncryptionSecret: TEST_AUTH_ENVIRONMENT.AUTH_TOKEN_ENCRYPTION_SECRET,
    });
  });

  it.each([
    ['AUTH_SESSION_IDLE_TIMEOUT_SECONDS', '299'],
    ['AUTH_SESSION_ABSOLUTE_TIMEOUT_SECONDS', '86401'],
    ['AUTH_LOGIN_ATTEMPT_TIMEOUT_SECONDS', '1801'],
    ['AUTH_SESSION_RETENTION_DAYS', '0'],
    ['AUTH_RATE_LIMIT_WINDOW_SECONDS', '9'],
    ['AUTH_RATE_LIMIT_SIGN_IN', '0'],
    ['AUTH_RATE_LIMIT_LOGOUT', '10001'],
    ['AUTH_TOKEN_ENCRYPTION_SECRET', 'too-short'],
  ])('rejects invalid %s', (key, value) => {
    expect(() => loadAuthConfig({ ...TEST_AUTH_ENVIRONMENT, [key]: value })).toThrow(key);
  });

  it('does not echo a rejected secret', () => {
    expect(() =>
      loadAuthConfig({
        ...TEST_AUTH_ENVIRONMENT,
        AUTH_TOKEN_ENCRYPTION_SECRET: 'sentinel-short',
      }),
    ).toThrow(ConfigurationError);
    try {
      loadAuthConfig({ ...TEST_AUTH_ENVIRONMENT, AUTH_TOKEN_ENCRYPTION_SECRET: 'sentinel-short' });
    } catch (error) {
      expect((error as Error).message).not.toContain('sentinel');
    }
  });
});
