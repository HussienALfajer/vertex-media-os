import { z } from 'zod';

/**
 * Typed application configuration. Raw environment variables are mapped here
 * exactly once; application code never reads `process.env` directly.
 */
export interface AppConfig {
  readonly environment: 'development' | 'test' | 'production';
  readonly http: {
    readonly host: string;
    readonly port: number;
  };
  readonly database: {
    /** PostgreSQL connection string. Secret: never logged or returned. */
    readonly url: string;
  };
  readonly logging: {
    readonly level: LogLevel;
  };
  readonly docs: {
    /** Serve the interactive OpenAPI UI. Never on by default in production. */
    readonly enabled: boolean;
  };
}

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

const postgresUrl = z
  .string()
  .regex(/^postgres(ql)?:\/\/.+/, 'must be a postgresql:// connection URL')
  .refine((value) => URL.canParse(value), 'must be a well-formed URL');

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().min(1).default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: postgresUrl,
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  API_DOCS_ENABLED: z.stringbool().optional(),
});

export class ConfigurationError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Invalid configuration:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
    this.name = 'ConfigurationError';
  }
}

/**
 * Builds the configuration from an environment-like map, failing fast with a
 * message that names offending variables but never echoes their values.
 */
export function loadAppConfig(source: Readonly<Record<string, string | undefined>>): AppConfig {
  const parsed = environmentSchema.safeParse(source);

  if (!parsed.success) {
    throw new ConfigurationError(
      parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    );
  }

  const env = parsed.data;

  return {
    environment: env.NODE_ENV,
    http: { host: env.API_HOST, port: env.API_PORT },
    database: { url: env.DATABASE_URL },
    logging: { level: env.LOG_LEVEL },
    docs: { enabled: env.API_DOCS_ENABLED ?? env.NODE_ENV !== 'production' },
  };
}
