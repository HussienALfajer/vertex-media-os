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

export function testAuthConfig(
  overrides: Readonly<Record<string, string | undefined>> = {},
): AuthConfig {
  return loadAuthConfig({ ...TEST_AUTH_ENVIRONMENT, ...overrides });
}
