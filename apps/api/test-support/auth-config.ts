import { loadAuthConfig, type AuthConfig } from '../src/config/auth-config.js';

/**
 * Authentication configuration for tests that do not sign anyone in. Nothing here is contacted
 * when the application starts: discovery happens on the first sign-in.
 */
export const TEST_AUTH_ENVIRONMENT = {
  NODE_ENV: 'test',
  KEYCLOAK_ISSUER_URL: 'http://127.0.0.1:1/realms/vertex',
  KEYCLOAK_WEB_CLIENT_SECRET: 'sentinel-web-client-secret-0000',
  KEYCLOAK_WEB_REDIRECT_URI: 'http://127.0.0.1:4300/api/auth/callback',
  KEYCLOAK_WEB_POST_LOGOUT_REDIRECT_URI: 'http://127.0.0.1:4300/',
  AUTH_TOKEN_ENCRYPTION_SECRET: 'sentinel-token-encryption-secret-000000',
} as const;

/**
 * Limits no suite reaches, for suites that sign in or are denied more often per minute than the
 * defaults allow and do not test the limits themselves (IAM-R09 D-03, D-04).
 */
export const UNLIMITED_RATES = {
  AUTH_RATE_LIMIT_SIGN_IN: '10000',
  AUTH_RATE_LIMIT_LOGOUT: '10000',
  AUTH_EVIDENCE_LIMIT: '10000',
} as const;

export function testAuthConfig(
  overrides: Readonly<Record<string, string | undefined>> = {},
): AuthConfig {
  return loadAuthConfig({ ...TEST_AUTH_ENVIRONMENT, ...overrides });
}
