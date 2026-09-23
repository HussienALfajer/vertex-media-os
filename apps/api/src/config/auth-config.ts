import { z } from 'zod';
import { ConfigurationError } from './app-config.js';

/**
 * Typed configuration of browser authentication (docs/modules/iam.md Section 39; IAM-R03 D-16): the
 * `vertex-web` OIDC client, the session limits and the secret that protects stored ID tokens.
 * Mapped from the environment exactly once. Kept apart from `AppConfig`, which commands such as
 * the reference synchronization load without any identity-provider value.
 */
export interface AuthConfig {
  readonly oidc: {
    /** `<origin>/realms/<realm>`; bound to every signed-in identity. */
    readonly issuer: string;
    readonly clientId: string;
    /** Secret: never logged or returned. */
    readonly clientSecret: string;
    /** The exact callback URI registered for `vertex-web`. */
    readonly redirectUri: string;
    /** The exact post-logout URI registered for `vertex-web`. */
    readonly postLogoutRedirectUri: string;
    /** Plain `http` endpoints are accepted outside production only. */
    readonly allowInsecureRequests: boolean;
  };
  readonly session: {
    readonly idleTimeoutSeconds: number;
    readonly absoluteTimeoutSeconds: number;
    readonly loginAttemptTimeoutSeconds: number;
  };
  /** Secret: the key material from which the ID-token encryption key is derived (D-17). */
  readonly tokenEncryptionSecret: string;
}

const REALM_ISSUER = /^https?:\/\/[^/]+(\/[^?#]*)?\/realms\/[^/?#]+$/;

const url = z.string().refine((value) => URL.canParse(value), 'must be a well-formed URL');
const httpUrl = url.refine((value) => /^https?:\/\//.test(value), 'must be an http(s) URL');

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    KEYCLOAK_ISSUER_URL: httpUrl.refine(
      (value) => REALM_ISSUER.test(value),
      'must have the form <origin>/realms/<realm>',
    ),
    KEYCLOAK_WEB_CLIENT_ID: z.string().min(1).default('vertex-web'),
    KEYCLOAK_WEB_CLIENT_SECRET: z.string().min(16, 'must be at least 16 characters'),
    KEYCLOAK_WEB_REDIRECT_URI: httpUrl.refine(
      (value) => !value.includes('?') && !value.includes('#'),
      'must not contain a query or fragment',
    ),
    KEYCLOAK_WEB_POST_LOGOUT_REDIRECT_URI: httpUrl,
    AUTH_SESSION_IDLE_TIMEOUT_SECONDS: z.coerce.number().int().min(300).max(3_600).default(1_800),
    AUTH_SESSION_ABSOLUTE_TIMEOUT_SECONDS: z.coerce
      .number()
      .int()
      .min(3_600)
      .max(86_400)
      .default(36_000),
    AUTH_LOGIN_ATTEMPT_TIMEOUT_SECONDS: z.coerce.number().int().min(60).max(1_800).default(600),
    AUTH_TOKEN_ENCRYPTION_SECRET: z.string().min(32, 'must be at least 32 characters'),
  })
  .refine(
    (env) => env.AUTH_SESSION_ABSOLUTE_TIMEOUT_SECONDS >= env.AUTH_SESSION_IDLE_TIMEOUT_SECONDS,
    {
      path: ['AUTH_SESSION_ABSOLUTE_TIMEOUT_SECONDS'],
      message: 'must not be shorter than AUTH_SESSION_IDLE_TIMEOUT_SECONDS',
    },
  )
  .superRefine((env, context) => {
    if (env.NODE_ENV !== 'production') return;
    for (const key of [
      'KEYCLOAK_ISSUER_URL',
      'KEYCLOAK_WEB_REDIRECT_URI',
      'KEYCLOAK_WEB_POST_LOGOUT_REDIRECT_URI',
    ] as const) {
      if (!env[key].startsWith('https://')) {
        context.addIssue({ code: 'custom', path: [key], message: 'must use https in production' });
      }
    }
  });

/**
 * Builds the authentication configuration, failing with a message that names offending variables
 * but never echoes their values.
 */
export function loadAuthConfig(source: Readonly<Record<string, string | undefined>>): AuthConfig {
  const parsed = environmentSchema.safeParse(source);
  if (!parsed.success) {
    throw new ConfigurationError(
      parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    );
  }
  const env = parsed.data;
  return {
    oidc: {
      issuer: env.KEYCLOAK_ISSUER_URL,
      clientId: env.KEYCLOAK_WEB_CLIENT_ID,
      clientSecret: env.KEYCLOAK_WEB_CLIENT_SECRET,
      redirectUri: env.KEYCLOAK_WEB_REDIRECT_URI,
      postLogoutRedirectUri: env.KEYCLOAK_WEB_POST_LOGOUT_REDIRECT_URI,
      allowInsecureRequests: env.NODE_ENV !== 'production',
    },
    session: {
      idleTimeoutSeconds: env.AUTH_SESSION_IDLE_TIMEOUT_SECONDS,
      absoluteTimeoutSeconds: env.AUTH_SESSION_ABSOLUTE_TIMEOUT_SECONDS,
      loginAttemptTimeoutSeconds: env.AUTH_LOGIN_ATTEMPT_TIMEOUT_SECONDS,
    },
    tokenEncryptionSecret: env.AUTH_TOKEN_ENCRYPTION_SECRET,
  };
}
