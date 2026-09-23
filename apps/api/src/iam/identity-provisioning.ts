import type { AuditRecorder } from '@vertex-os/audit';
import { createAuditRecorder } from '@vertex-os/audit-persistence';
import type { DatabaseClient, DatabaseTransaction } from '@vertex-os/database';
import {
  provisionIdentity,
  reconcileIdentity,
  resendInvitation,
  type IdentityProvisioningDependencies,
  type IdentityProvisioningRequest,
  type InvitationDispatchResult,
  type ProvisionIdentityResult,
  type ReconcileIdentityResult,
} from '@vertex-os/iam';
import { createKeycloakIdentityProvider } from '@vertex-os/iam-keycloak';
import {
  createApplicationUserRepository,
  createIamTransactionRunner,
} from '@vertex-os/iam-persistence';
import type { IdentityProvisioningConfig } from '../config/identity-provisioning-config.js';

/** IAM identity provisioning bound to its adapters (IAM-R02 D-18). */
export interface IdentityProvisioning {
  provision(request: IdentityProvisioningRequest): Promise<ProvisionIdentityResult>;
  reconcile(request: IdentityProvisioningRequest): Promise<ReconcileIdentityResult>;
  resendInvitation(request: IdentityProvisioningRequest): Promise<InvitationDispatchResult>;
}

export interface IdentityProvisioningOptions {
  /** Replaces the global `fetch` of the Keycloak adapter, for tests that fault the transport. */
  readonly fetch?: typeof fetch;
  /** Binds MOD-AUDIT's append capability to a transaction; the Audit adapter by default. */
  readonly auditRecorderFor?: (handle: DatabaseClient | DatabaseTransaction) => AuditRecorder;
}

/**
 * Composition root of identity provisioning: the IAM capabilities wired to the PostgreSQL
 * adapters, the Audit adapter and the Keycloak Admin adapter. Not mounted in the HTTP runtime;
 * the administrative use cases of IAM-MP-10 and the bootstrap command consume it.
 */
export function createIdentityProvisioning(
  config: IdentityProvisioningConfig,
  database: DatabaseClient,
  options: IdentityProvisioningOptions = {},
): IdentityProvisioning {
  const dependencies: IdentityProvisioningDependencies = {
    users: createApplicationUserRepository(database),
    runner: createIamTransactionRunner(database, {
      auditRecorderFor: options.auditRecorderFor ?? createAuditRecorder,
    }),
    identityProvider: createKeycloakIdentityProvider({
      issuer: config.issuer,
      clientId: config.provisioner.clientId,
      clientSecret: config.provisioner.clientSecret,
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    }),
    invitationLifespanSeconds: config.invitationLifespanSeconds,
  };
  return Object.freeze({
    provision: (request: IdentityProvisioningRequest) => provisionIdentity(dependencies, request),
    reconcile: (request: IdentityProvisioningRequest) => reconcileIdentity(dependencies, request),
    resendInvitation: (request: IdentityProvisioningRequest) =>
      resendInvitation(dependencies, request),
  });
}
