/**
 * MOD-IAM's private entry for its identity-provider adapter (`domains/iam-keycloak`). Only that
 * adapter may import it (lint-enforced). It carries the port the adapter implements and the IAM
 * types in its signatures, nothing else.
 */
export { factorActions } from './application/ports/identity-provider.js';
export type {
  ExternalIdentity,
  IdentityProvider,
  IdentityProviderFailure,
  InvitationAction,
  ProviderResult,
} from './application/ports/identity-provider.js';
export type { NormalizedEmail } from './domain/email.js';
export type { UserId } from './domain/identifiers.js';
