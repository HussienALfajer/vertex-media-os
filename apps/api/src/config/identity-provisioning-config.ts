import { z } from 'zod';
import { ConfigurationError } from './app-config.js';
import { REALM_ISSUER } from './auth-config.js';

/**
 * Typed configuration of IAM identity provisioning (docs/modules/iam.md Section 39): the Keycloak
 * issuer, the `vertex-provisioner` service account and the invitation lifespan. Mapped from the
 * environment exactly once, like `loadAppConfig`, and kept apart from `AppConfig` so the HTTP
 * runtime does not require Keycloak values before a stage composes provisioning into it.
 */
export interface IdentityProvisioningConfig {
  readonly issuer: string;
  readonly provisioner: {
    readonly clientId: string;
    /** Secret: never logged or returned. */
    readonly clientSecret: string;
  };
  readonly invitationLifespanSeconds: number;
}

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    KEYCLOAK_ISSUER_URL: z
      .string()
      .refine((value) => URL.canParse(value), 'must be a well-formed URL')
      .refine((value) => REALM_ISSUER.test(value), 'must have the form <origin>/realms/<realm>'),
    KEYCLOAK_PROVISIONER_CLIENT_ID: z.string().min(1),
    KEYCLOAK_PROVISIONER_CLIENT_SECRET: z.string().min(16, 'must be at least 16 characters'),
    KEYCLOAK_INVITATION_LIFESPAN_SECONDS: z.coerce
      .number()
      .int()
      .min(300)
      .max(604_800)
      .default(43_200),
  })
  .refine(
    (env) => env.NODE_ENV !== 'production' || env.KEYCLOAK_ISSUER_URL.startsWith('https://'),
    { path: ['KEYCLOAK_ISSUER_URL'], message: 'must use https in production' },
  );

/**
 * Builds the provisioning configuration, failing with a message that names offending variables
 * but never echoes their values.
 */
export function loadIdentityProvisioningConfig(
  source: Readonly<Record<string, string | undefined>>,
): IdentityProvisioningConfig {
  const parsed = environmentSchema.safeParse(source);
  if (!parsed.success) {
    throw new ConfigurationError(
      parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    );
  }
  const env = parsed.data;
  return {
    issuer: env.KEYCLOAK_ISSUER_URL,
    provisioner: {
      clientId: env.KEYCLOAK_PROVISIONER_CLIENT_ID,
      clientSecret: env.KEYCLOAK_PROVISIONER_CLIENT_SECRET,
    },
    invitationLifespanSeconds: env.KEYCLOAK_INVITATION_LIFESPAN_SECONDS,
  };
}
