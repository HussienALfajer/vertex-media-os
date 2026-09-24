import { describe, expect, it } from 'vitest';
import { TEST_AUTH_ENVIRONMENT } from '../../test-support/auth-config.js';
import { ConfigurationError } from './app-config.js';
import { loadAuthConfig } from './auth-config.js';

describe('loadAuthConfig', () => {
  it('maps the environment and applies the default limits', () => {
    const config = loadAuthConfig(TEST_AUTH_ENVIRONMENT);
    expect(config).toEqual({
      oidc: {
        issuer: 'http://127.0.0.1:1/realms/vertex',
        clientId: 'vertex-web',
        clientSecret: TEST_AUTH_ENVIRONMENT.KEYCLOAK_WEB_CLIENT_SECRET,
        redirectUri: 'http://127.0.0.1:4300/api/auth/callback',
        postLogoutRedirectUri: 'http://127.0.0.1:4300/',
        allowInsecureRequests: true,
      },
      session: {
        idleTimeoutSeconds: 1800,
        absoluteTimeoutSeconds: 36000,
        loginAttemptTimeoutSeconds: 600,
        retentionDays: 30,
      },
      rateLimits: { windowSeconds: 60, signIn: 60, logout: 30, evidence: 30 },
      tokenEncryptionSecret: TEST_AUTH_ENVIRONMENT.AUTH_TOKEN_ENCRYPTION_SECRET,
    });
  });

  it.each([
    ['AUTH_SESSION_IDLE_TIMEOUT_SECONDS', '3601'],
    ['AUTH_SESSION_IDLE_TIMEOUT_SECONDS', '299'],
    ['AUTH_SESSION_ABSOLUTE_TIMEOUT_SECONDS', '86401'],
    ['AUTH_LOGIN_ATTEMPT_TIMEOUT_SECONDS', '1801'],
    ['AUTH_SESSION_RETENTION_DAYS', '0'],
    ['AUTH_SESSION_RETENTION_DAYS', '366'],
    ['AUTH_RATE_LIMIT_WINDOW_SECONDS', '9'],
    ['AUTH_RATE_LIMIT_SIGN_IN', '0'],
    ['AUTH_RATE_LIMIT_LOGOUT', '10001'],
    ['AUTH_EVIDENCE_LIMIT', 'many'],
    ['KEYCLOAK_ISSUER_URL', 'http://127.0.0.1:8080/'],
    ['KEYCLOAK_WEB_REDIRECT_URI', 'http://127.0.0.1:4200/api/auth/callback?x=1'],
    ['AUTH_TOKEN_ENCRYPTION_SECRET', 'too-short'],
    ['KEYCLOAK_WEB_CLIENT_SECRET', 'short'],
  ])('rejects %s=%s', (key, value) => {
    expect(() => loadAuthConfig({ ...TEST_AUTH_ENVIRONMENT, [key]: value })).toThrow(key);
  });

  it('keeps the absolute lifetime at least as long as the idle timeout', () => {
    expect(() =>
      loadAuthConfig({
        ...TEST_AUTH_ENVIRONMENT,
        AUTH_SESSION_IDLE_TIMEOUT_SECONDS: '3600',
        AUTH_SESSION_ABSOLUTE_TIMEOUT_SECONDS: '3600',
      }),
    ).not.toThrow();
  });

  it('requires https and refuses plain-http provider requests in production', () => {
    const production = { ...TEST_AUTH_ENVIRONMENT, NODE_ENV: 'production' };
    expect(() => loadAuthConfig(production)).toThrow(
      /KEYCLOAK_ISSUER_URL: must use https[\s\S]*KEYCLOAK_WEB_REDIRECT_URI[\s\S]*KEYCLOAK_WEB_POST_LOGOUT_REDIRECT_URI/,
    );
    const secure = loadAuthConfig({
      ...production,
      KEYCLOAK_ISSUER_URL: 'https://id.example.test/realms/vertex',
      KEYCLOAK_WEB_REDIRECT_URI: 'https://app.example.test/api/auth/callback',
      KEYCLOAK_WEB_POST_LOGOUT_REDIRECT_URI: 'https://app.example.test/',
    });
    expect(secure.oidc.allowInsecureRequests).toBe(false);
  });

  it('names missing variables without echoing any secret value', () => {
    let failure: unknown;
    try {
      loadAuthConfig({
        ...TEST_AUTH_ENVIRONMENT,
        AUTH_TOKEN_ENCRYPTION_SECRET: undefined,
        KEYCLOAK_WEB_CLIENT_SECRET: 'sentinel-short',
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(ConfigurationError);
    const message = (failure as Error).message;
    expect(message).toContain('AUTH_TOKEN_ENCRYPTION_SECRET');
    expect(message).toContain('KEYCLOAK_WEB_CLIENT_SECRET');
    expect(message).not.toContain('sentinel');
  });
});
