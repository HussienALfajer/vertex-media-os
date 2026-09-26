import { describe, expect, it } from 'vitest';
import { TEST_AUTH_ENVIRONMENT } from '../../test-support/auth-config.js';
import { loadAuthConfig } from './auth-config.js';

describe('local authentication configuration', () => {
  it('uses bounded session and rate limits without an identity provider', () => {
    expect(loadAuthConfig(TEST_AUTH_ENVIRONMENT)).toEqual({
      session: {
        idleTimeoutSeconds: 1_800,
        absoluteTimeoutSeconds: 36_000,
        retentionDays: 30,
      },
      rateLimits: { windowSeconds: 60, signIn: 10, logout: 30, evidence: 30 },
    });
  });

  it.each([
    ['AUTH_SESSION_IDLE_TIMEOUT_SECONDS', '299'],
    ['AUTH_SESSION_ABSOLUTE_TIMEOUT_SECONDS', '86401'],
    ['AUTH_SESSION_RETENTION_DAYS', '0'],
    ['AUTH_RATE_LIMIT_WINDOW_SECONDS', '9'],
    ['AUTH_RATE_LIMIT_SIGN_IN', '0'],
    ['AUTH_RATE_LIMIT_LOGOUT', '10001'],
  ])('rejects invalid %s', (key, value) => {
    expect(() => loadAuthConfig({ ...TEST_AUTH_ENVIRONMENT, [key]: value })).toThrow(key);
  });

  it('starts without the retired provider token-encryption key', () => {
    expect(loadAuthConfig(TEST_AUTH_ENVIRONMENT).session.idleTimeoutSeconds).toBe(1_800);
  });
});
