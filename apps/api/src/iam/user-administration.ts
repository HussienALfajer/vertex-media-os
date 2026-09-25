import type { AuditAttribution, AuditRecorder } from '@vertex-os/audit';
import { createAuditRecorder } from '@vertex-os/audit-persistence';
import type { DatabaseClient, DatabaseTransaction } from '@vertex-os/database';
import type {
  BootstrapRequest,
  BootstrapResult,
  CreateUserRequest,
  CreateUserResult,
  InitializePasswordResult,
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
  initializePassword,
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
import {
  createApplicationUserRepository,
  createIamTransactionRunner,
  createLocalIdentityProvider,
} from '@vertex-os/iam-persistence';
import type { RevocationReason } from '../auth/session-store.js';
import { hashPassword, validPassword } from '../auth/passwords.js';
import type { IdentityProvisioningConfig } from '../config/identity-provisioning-config.js';

/**
 * IAM user lifecycle administration bound to its adapters (IAM-R06 D-01). Every operation takes
 * the caller's attribution; the coarse permission check is the HTTP route's. Bootstrap
 * is not here: it is an operator command, never an HTTP capability (spec Section 21).
 */
export interface IamUserAdministration {
  createUser(
    r: Omit<CreateUserRequest, 'displayName' | 'passwordHash'> & {
      readonly displayName?: string;
      readonly password?: string;
    },
    a: AuditAttribution,
  ): Promise<CreateUserResult>;
  updateDisplayName(
    r: UpdateDisplayNameRequest,
    a: AuditAttribution,
  ): Promise<UpdateDisplayNameResult>;
  initializePassword(
    r: { readonly userId: string; readonly expectedVersion: number; readonly password: string },
    a: AuditAttribution,
  ): Promise<InitializePasswordResult>;
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
  /**
   * The authentication area's revocation of every live session of a user: `AuthRuntime.sessions`
   * in the HTTP runtime (IAM-R07 D-09), the session store in the bootstrap command.
   */
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
    identityProvider: createLocalIdentityProvider(database),
    invitationLifespanSeconds: config.invitationLifespanSeconds,
    sessions: {
      revokeUserSessions: (userId, reason, attribution) =>
        options.revokeUserSessions(userId, revocationReasons[reason], attribution),
    },
  };
}

/** Composition root of IAM user administration; `IamModule` mounts it in HTTP (IAM-R07 D-01). */
export function createIamUserAdministration(
  config: IdentityProvisioningConfig,
  database: DatabaseClient,
  options: IamUserAdministrationOptions,
): IamUserAdministration {
  const dependencies = userAdministrationDependencies(config, database, options);
  return Object.freeze({
    createUser: async (r, a) => {
      if (r.password !== undefined && !validPassword(r.password)) {
        return { outcome: 'invalid', field: 'password' };
      }
      const passwordHash = r.password === undefined ? undefined : await hashPassword(r.password);
      return createUser(
        dependencies,
        {
          email: r.email,
          displayName: r.displayName ?? r.email,
          ...(r.memberships === undefined ? {} : { memberships: r.memberships }),
          ...(r.roleIds === undefined ? {} : { roleIds: r.roleIds }),
          ...(passwordHash === undefined ? {} : { passwordHash }),
        },
        a,
      );
    },
    updateDisplayName: (r, a) => updateDisplayName(dependencies, r, a),
    initializePassword: async (r, a) => {
      if (!validPassword(r.password)) return { outcome: 'invalid', field: 'password' };
      return initializePassword(
        dependencies,
        {
          userId: r.userId,
          expectedVersion: r.expectedVersion,
          passwordHash: await hashPassword(r.password),
        },
        a,
      );
    },
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
