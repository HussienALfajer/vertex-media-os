import type { AuditAttribution, AuditRecorder } from '@vertex-os/audit';
import { createAuditRecorder } from '@vertex-os/audit-persistence';
import type { DatabaseClient, DatabaseTransaction } from '@vertex-os/database';
import type {
  BootstrapRequest,
  BootstrapResult,
  CreateUserRequest,
  CreateUserResult,
  ReactivateUserRequest,
  ReactivateUserResult,
  ResendUserInvitationResult,
  RestrictUserResult,
  RevokeUserSessionsResult,
  SyncIdentityResult,
  UpdateDisplayNameRequest,
  UpdateDisplayNameResult,
  UserRequest,
} from '@vertex-os/iam';
import {
  bootstrapSystemAdministrator,
  createUser,
  disableUser,
  reactivateUser,
  resendUserInvitation,
  revokeUserSessions,
  suspendUser,
  syncIdentity,
  terminateUser,
  updateDisplayName,
  type SessionRevocationReason,
  type UserAdministrationDependencies,
} from '@vertex-os/iam/composition';
import { createKeycloakIdentityProvider } from '@vertex-os/iam-keycloak';
import {
  createApplicationUserRepository,
  createIamTransactionRunner,
} from '@vertex-os/iam-persistence';
import type { RevocationReason } from '../auth/session-store.js';
import type { IdentityProvisioningConfig } from '../config/identity-provisioning-config.js';

/**
 * IAM user lifecycle administration bound to its adapters (IAM-R06 D-01). Every operation takes
 * the caller's attribution; the coarse permission check is the HTTP route's (IAM-MP-11). Bootstrap
 * is not here: it is an operator command, never an HTTP capability (spec Section 21).
 */
export interface IamUserAdministration {
  createUser(r: CreateUserRequest, a: AuditAttribution): Promise<CreateUserResult>;
  updateDisplayName(
    r: UpdateDisplayNameRequest,
    a: AuditAttribution,
  ): Promise<UpdateDisplayNameResult>;
  suspendUser(r: UserRequest, a: AuditAttribution): Promise<RestrictUserResult>;
  disableUser(r: UserRequest, a: AuditAttribution): Promise<RestrictUserResult>;
  terminateUser(r: UserRequest, a: AuditAttribution): Promise<RestrictUserResult>;
  reactivateUser(r: ReactivateUserRequest, a: AuditAttribution): Promise<ReactivateUserResult>;
  syncIdentity(r: UserRequest, a: AuditAttribution): Promise<SyncIdentityResult>;
  resendInvitation(r: UserRequest, a: AuditAttribution): Promise<ResendUserInvitationResult>;
  revokeSessions(r: UserRequest, a: AuditAttribution): Promise<RevokeUserSessionsResult>;
}

/** Revokes every live application session of a user; the authentication area's capability. */
export type RevokeUserSessions = (
  userId: string,
  reason: RevocationReason,
  attribution: AuditAttribution,
) => Promise<number>;

export interface IamUserAdministrationOptions {
  /** The session revocation of the authentication area (`SessionService.revokeUserSessions`). */
  readonly revokeUserSessions: RevokeUserSessions;
  /** Binds MOD-AUDIT's append capability to a transaction; the Audit adapter by default. */
  readonly auditRecorderFor?: (handle: DatabaseClient | DatabaseTransaction) => AuditRecorder;
  /** Replaces the global `fetch` of the Keycloak adapter, for tests that fault the transport. */
  readonly fetch?: typeof fetch;
}

/** IAM's revocation reasons as the session table records them (IAM-R06 D-09). */
const revocationReasons: Readonly<Record<SessionRevocationReason, RevocationReason>> = {
  suspended: 'USER_SUSPENDED',
  disabled: 'USER_DISABLED',
  terminated: 'USER_TERMINATED',
  administrator: 'ADMINISTRATOR_REVOKED',
};

function userAdministrationDependencies(
  config: IdentityProvisioningConfig,
  database: DatabaseClient,
  options: IamUserAdministrationOptions,
): UserAdministrationDependencies {
  return {
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
    sessions: {
      revokeUserSessions: (userId, reason, attribution) =>
        options.revokeUserSessions(userId, revocationReasons[reason], attribution),
    },
  };
}

/** Composition root of IAM user administration. Not mounted in HTTP; IAM-MP-11 consumes it. */
export function createIamUserAdministration(
  config: IdentityProvisioningConfig,
  database: DatabaseClient,
  options: IamUserAdministrationOptions,
): IamUserAdministration {
  const dependencies = userAdministrationDependencies(config, database, options);
  return Object.freeze({
    createUser: (r, a) => createUser(dependencies, r, a),
    updateDisplayName: (r, a) => updateDisplayName(dependencies, r, a),
    suspendUser: (r, a) => suspendUser(dependencies, r, a),
    disableUser: (r, a) => disableUser(dependencies, r, a),
    terminateUser: (r, a) => terminateUser(dependencies, r, a),
    reactivateUser: (r, a) => reactivateUser(dependencies, r, a),
    syncIdentity: (r, a) => syncIdentity(dependencies, r, a),
    resendInvitation: (r, a) => resendUserInvitation(dependencies, r, a),
    revokeSessions: (r, a) => revokeUserSessions(dependencies, r, a),
  } satisfies IamUserAdministration);
}

/**
 * The bootstrap capability, for the operator command only (spec Section 21.1): it acts as the
 * `iam.bootstrap` system process, never as an HTTP caller.
 */
export function createIamBootstrap(
  config: IdentityProvisioningConfig,
  database: DatabaseClient,
  options: IamUserAdministrationOptions,
): (request: BootstrapRequest) => Promise<BootstrapResult> {
  const dependencies = userAdministrationDependencies(config, database, options);
  return (request) => bootstrapSystemAdministrator(dependencies, request);
}
