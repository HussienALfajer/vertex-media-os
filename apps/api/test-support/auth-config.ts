import { loadAuthConfig, type AuthConfig } from '../src/config/auth-config.js';

/**
 * Authentication configuration for tests that do not sign anyone in. Nothing here is contacted
 * when the application starts: discovery happens on the first sign-in.
 */
export const TEST_AUTH_ENVIRONMENT = {
  NODE_ENV: 'test',
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
