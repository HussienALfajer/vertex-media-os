import { z } from 'zod';
import { ConfigurationError } from './app-config.js';

/** Local password authentication and server-owned application-session settings. */
export interface AuthConfig {
  readonly session: {
    readonly idleTimeoutSeconds: number;
    readonly absoluteTimeoutSeconds: number;
    readonly retentionDays: number;
  };
  readonly rateLimits: {
    readonly windowSeconds: number;
    readonly signIn: number;
    readonly logout: number;
    readonly evidence: number;
  };
}

const environmentSchema = z
  .object({
    AUTH_SESSION_IDLE_TIMEOUT_SECONDS: z.coerce.number().int().min(300).max(3_600).default(1_800),
    AUTH_SESSION_ABSOLUTE_TIMEOUT_SECONDS: z.coerce
      .number()
      .int()
      .min(3_600)
      .max(86_400)
      .default(36_000),
    AUTH_SESSION_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    AUTH_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(10).max(3_600).default(60),
    AUTH_RATE_LIMIT_SIGN_IN: z.coerce.number().int().min(1).max(100).default(10),
    AUTH_RATE_LIMIT_LOGOUT: z.coerce.number().int().min(1).max(10_000).default(30),
    AUTH_EVIDENCE_LIMIT: z.coerce.number().int().min(1).max(10_000).default(30),
  })
  .refine(
    (value) =>
      value.AUTH_SESSION_ABSOLUTE_TIMEOUT_SECONDS >= value.AUTH_SESSION_IDLE_TIMEOUT_SECONDS,
    {
      path: ['AUTH_SESSION_ABSOLUTE_TIMEOUT_SECONDS'],
      message: 'must not be shorter than the idle timeout',
    },
  );

export function loadAuthConfig(source: Readonly<Record<string, string | undefined>>): AuthConfig {
  const parsed = environmentSchema.safeParse(source);
  if (!parsed.success) {
    throw new ConfigurationError(
      parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    );
  }
  const env = parsed.data;
  return {
    session: {
      idleTimeoutSeconds: env.AUTH_SESSION_IDLE_TIMEOUT_SECONDS,
      absoluteTimeoutSeconds: env.AUTH_SESSION_ABSOLUTE_TIMEOUT_SECONDS,
      retentionDays: env.AUTH_SESSION_RETENTION_DAYS,
    },
    rateLimits: {
      windowSeconds: env.AUTH_RATE_LIMIT_WINDOW_SECONDS,
      signIn: env.AUTH_RATE_LIMIT_SIGN_IN,
      logout: env.AUTH_RATE_LIMIT_LOGOUT,
      evidence: env.AUTH_EVIDENCE_LIMIT,
    },
  };
}
