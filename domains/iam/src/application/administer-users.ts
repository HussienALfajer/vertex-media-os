import type { AuditAttribution, AuditRecorder } from '@vertex-os/audit';
import { newApplicationUser, type ApplicationUser } from '../domain/application-user.js';
import {
  parseDepartmentId,
  parseRoleId,
  parseUserId,
  type DepartmentId,
  type RoleId,
  type UserId,
} from '../domain/identifiers.js';
import type { RoleView } from '../domain/roles.js';
import { parseDisplayName } from '../domain/text.js';
import {
  decideAccessRestriction,
  decideReactivation,
  toUserView,
  type RestrictedAccessState,
  type UserView,
} from '../domain/user-lifecycle.js';
import { parseExpectedVersion, requireIamEvidence } from './administration-evidence.js';
import { grantExceedsActor, recordGrantRefusal, roleGrant } from './grant-ceiling.js';
import {
  appendUserAudit,
  providerFailure,
  type IdentityFailure,
  type IdentityProvisioningDependencies,
  type IdentityProvisioningRequest,
} from './identity-provisioning-dependencies.js';
import {
  dispatchInvitation,
  resendInvitation,
  type InvitationDispatchResult,
} from './invitation-dispatch.js';
import type { RoleStore } from './ports/role-store.js';
import type { SessionRevocation, SessionRevocationReason } from './ports/session-revocation.js';
import { provisionIdentity } from './provision-identity.js';
import {
  enableIdentityForReactivation,
  reconcileIdentity,
  type ReconcileIdentityResult,
} from './reconcile-identity.js';

/** What user administration needs; composition supplies it. */
export interface UserAdministrationDependencies extends IdentityProvisioningDependencies {
  readonly sessions: SessionRevocation;
}

type Invalid<Field extends string> = { readonly outcome: 'invalid'; readonly field: Field };

/** Upper bound of initial memberships or roles in one creation request. */
const MAX_INITIAL_REFERENCES = 100;

/** How identity synchronization ended after a committed local change (spec Section 27). */
export type IdentitySyncOutcome =
  | { readonly outcome: 'synced' }
  | { readonly outcome: 'failed'; readonly failure: IdentityFailure }
  /** Competing changes kept winning; their own reconciliation owns the state. */
  | { readonly outcome: 'superseded' };

/** How an invitation dispatch ended (spec Section 11.3). */
export type InvitationOutcome =
  | { readonly outcome: 'sent' }
  | { readonly outcome: 'failed'; readonly failure: IdentityFailure }
  /** The identity has verified its email and enrolled every factor; nothing was sent. */
  | { readonly outcome: 'no-action-required' }
  /** No dispatch was due: the user is not INVITED, not SYNCED, or was already invited. */
  | { readonly outcome: 'not-applicable' }
  | { readonly outcome: 'superseded' };

export interface CreateUserRequest {
  readonly email: string;
  readonly displayName: string;
  readonly memberships?: readonly { readonly departmentId: string; readonly isPrimary: boolean }[];
  readonly roleIds?: readonly string[];
}

export type CreateUserResult =
  | {
      readonly outcome: 'created';
      readonly user: UserView;
      readonly identity: IdentitySyncOutcome;
      readonly invitation: InvitationOutcome;
    }
  | {
      readonly outcome:
        | 'email-conflict'
        | 'role-not-found'
        | 'role-inactive'
        | 'department-not-found'
        | 'department-inactive'
        | 'grant-exceeds-actor';
    }
  | Invalid<'email' | 'displayName' | 'memberships' | 'roleIds'>;

export interface UpdateDisplayNameRequest {
  readonly userId: string;
  readonly expectedVersion: number;
  readonly displayName: string;
}

export type UpdateDisplayNameResult =
  | { readonly outcome: 'updated' | 'unchanged'; readonly user: UserView }
  | { readonly outcome: 'user-not-found' | 'version-conflict' }
  | Invalid<'userId' | 'expectedVersion' | 'displayName'>;

export interface UserRequest {
  readonly userId: string;
}

export type RestrictUserResult =
  | {
      readonly outcome: 'restricted';
      readonly user: UserView;
      readonly sessionsRevoked: number;
      readonly identity: IdentitySyncOutcome;
    }
  | { readonly outcome: 'user-not-found' | 'invalid-access-transition' | 'last-system-admin' }
  | Invalid<'userId'>;

export interface ReactivateUserRequest {
  readonly userId: string;
  readonly expectedVersion: number;
}

export type ReactivateUserResult =
  | {
      readonly outcome: 'reactivated';
      readonly target: 'ACTIVE' | 'INVITED';
      readonly user: UserView;
      readonly invitation: InvitationOutcome;
    }
  | { readonly outcome: 'identity-failed'; readonly failure: IdentityFailure }
  | {
      readonly outcome:
        | 'user-not-found'
        | 'version-conflict'
        | 'invalid-access-transition'
        | 'grant-exceeds-actor'
        | 'superseded';
    }
  | Invalid<'userId' | 'expectedVersion'>;

export type SyncIdentityResult =
  | { readonly outcome: 'synced'; readonly user: UserView; readonly invitation: InvitationOutcome }
  | { readonly outcome: 'identity-failed'; readonly failure: IdentityFailure }
  | { readonly outcome: 'user-not-found' | 'superseded' }
  | Invalid<'userId'>;

export type ResendUserInvitationResult =
  | { readonly outcome: 'sent' | 'no-action-required'; readonly user: UserView }
  | { readonly outcome: 'identity-failed'; readonly failure: IdentityFailure }
  | {
      readonly outcome: 'user-not-found' | 'not-invited' | 'sync-incomplete' | 'superseded';
    }
  | Invalid<'userId'>;

/** What ending the identity's Keycloak sessions did (IAM-R06 D-10). */
export type ProviderSessionsOutcome =
  | { readonly outcome: 'terminated' }
  /** No identity is bound to the user: there is nothing to end. */
  | { readonly outcome: 'no-identity' }
  | { readonly outcome: 'failed'; readonly failure: IdentityFailure };

export type RevokeUserSessionsResult =
  | {
      readonly outcome: 'revoked';
      readonly sessionsRevoked: number;
      readonly providerSessions: ProviderSessionsOutcome;
    }
  | { readonly outcome: 'user-not-found' }
  | Invalid<'userId'>;

export function identitySyncOutcome(result: ReconcileIdentityResult): IdentitySyncOutcome {
  switch (result.outcome) {
    case 'synced':
      return { outcome: 'synced' };
    case 'failed':
      return { outcome: 'failed', failure: result.failure };
    default:
      return { outcome: 'superseded' };
  }
}

export function invitationOutcome(
  result: InvitationDispatchResult | { readonly outcome: 'not-applicable' },
): InvitationOutcome {
  switch (result.outcome) {
    case 'sent':
    case 'no-action-required':
    case 'not-applicable':
    case 'superseded':
      return { outcome: result.outcome };
    case 'failed':
      return { outcome: 'failed', failure: result.failure };
    default:
      return { outcome: 'not-applicable' };
  }
}

/** The committed user as a view; it exists, because users are never deleted (spec Section 29). */
async function committedView(
  dependencies: IdentityProvisioningDependencies,
  userId: UserId,
): Promise<UserView> {
  const user = await dependencies.users.findById(userId);
  if (!user) throw new Error('A committed user disappeared.');
  return toUserView(user);
}

/**
 * The one `iam.user.created` record shape, for user creation and bootstrap alike (IAM-R06 D-04):
 * the initial states, departments, primary and role codes, never the email.
 */
export function recordUserCreated(
  audit: AuditRecorder,
  attribution: AuditAttribution,
  user: ApplicationUser,
  grants: {
    readonly departmentIds: readonly string[];
    readonly primaryDepartmentId: string | undefined;
    readonly roleCodes: readonly string[];
  },
): Promise<void> {
  return appendUserAudit(audit, attribution, user, 'iam.user.created', 'SUCCEEDED', {
    after: {
      accessState: user.accessState,
      identitySyncState: user.identitySyncState,
      invitationDeliveryState: user.invitationDeliveryState,
      departmentIds: [...grants.departmentIds].sort(),
      primaryDepartmentId: grants.primaryDepartmentId ?? null,
      roleCodes: [...grants.roleCodes].sort(),
    },
  });
}

function request(userId: UserId, attribution: AuditAttribution): IdentityProvisioningRequest {
  return { userId, attribution };
}

/**
 * Creates an INVITED user with initial memberships and roles, then provisions the identity (spec
 * Section 12; IAM-R06 D-11). The user, memberships, assignments and evidence commit together
 * under the R05 rules: referenced roles and departments must exist and be ACTIVE, and the actor
 * may grant only what the grant ceiling allows. Keycloak work runs only after that commit; an
 * existing email creates nothing anywhere.
 */
export async function createUser(
  dependencies: UserAdministrationDependencies,
  input: CreateUserRequest,
  attribution: AuditAttribution,
): Promise<CreateUserResult> {
  const requestedMemberships = input.memberships ?? [];
  const requestedRoles = input.roleIds ?? [];
  if (
    !Array.isArray(requestedMemberships) ||
    requestedMemberships.length > MAX_INITIAL_REFERENCES
  ) {
    return { outcome: 'invalid', field: 'memberships' };
  }
  if (!Array.isArray(requestedRoles) || requestedRoles.length > MAX_INITIAL_REFERENCES) {
    return { outcome: 'invalid', field: 'roleIds' };
  }
  const memberships: { departmentId: DepartmentId; isPrimary: boolean }[] = [];
  for (const membership of requestedMemberships) {
    const departmentId =
      typeof membership?.departmentId === 'string'
        ? parseDepartmentId(membership.departmentId)
        : undefined;
    if (!departmentId?.ok || typeof membership.isPrimary !== 'boolean') {
      return { outcome: 'invalid', field: 'memberships' };
    }
    memberships.push({ departmentId: departmentId.value, isPrimary: membership.isPrimary });
  }
  const roleIds: RoleId[] = [];
  for (const value of requestedRoles) {
    const roleId = typeof value === 'string' ? parseRoleId(value) : undefined;
    if (!roleId?.ok) return { outcome: 'invalid', field: 'roleIds' };
    roleIds.push(roleId.value);
  }
  if (typeof input.email !== 'string') return { outcome: 'invalid', field: 'email' };
  if (typeof input.displayName !== 'string') return { outcome: 'invalid', field: 'displayName' };
  const draft = newApplicationUser({
    email: input.email,
    displayName: input.displayName,
    memberships,
    roleIds,
  });
  if (!draft.ok) {
    const field = {
      'invalid-email': 'email',
      'invalid-display-name': 'displayName',
      'duplicate-department': 'memberships',
      'multiple-primary': 'memberships',
      'duplicate-role': 'roleIds',
    } as const;
    return { outcome: 'invalid', field: field[draft.reason] };
  }
  const values = draft.value;

  const created = await dependencies.runner.run(
    async ({ roles, organization, lifecycle, audit }) => {
      // Lock order role → user → department (IAM-R06 D-05), several rows in ID order.
      const lockedRoles: RoleView[] = [];
      for (const roleId of [...values.roleIds].sort()) {
        const role = await roles.lockRole(roleId);
        if (role === undefined) return { outcome: 'role-not-found' as const };
        if (role.state !== 'ACTIVE') return { outcome: 'role-inactive' as const };
        lockedRoles.push(role);
      }
      const departmentIds = values.memberships.map((membership) => membership.departmentId);
      for (const departmentId of [...departmentIds].sort()) {
        const department = await organization.lockDepartment(departmentId, 'share');
        if (department === undefined) return { outcome: 'department-not-found' as const };
        if (department.state !== 'ACTIVE') return { outcome: 'department-inactive' as const };
      }
      for (const role of lockedRoles) {
        if (await grantExceedsActor(roles, attribution, await roleGrant(roles, role))) {
          await recordGrantRefusal(
            audit,
            attribution,
            'iam.user.role-assigned',
            { type: 'iam.role', id: role.id },
            { roleCode: role.code },
          );
          return { outcome: 'grant-exceeds-actor' as const };
        }
      }
      const inserted = await lifecycle.insertUser({
        email: values.email,
        displayName: values.displayName,
      });
      if (inserted.outcome === 'email-taken') return { outcome: 'email-conflict' as const };
      const user = inserted.user;
      for (const membership of values.memberships) {
        await organization.insertMembership({ userId: user.id, ...membership });
      }
      for (const role of lockedRoles) {
        await roles.insertAssignment({ userId: user.id, roleId: role.id });
      }
      const primary = values.memberships.find((membership) => membership.isPrimary);
      await recordUserCreated(audit, attribution, user, {
        departmentIds,
        primaryDepartmentId: primary?.departmentId,
        roleCodes: lockedRoles.map((role) => role.code),
      });
      return { outcome: 'created' as const, userId: user.id };
    },
  );
  if (created.outcome !== 'created') return created;

  const provisioned = await provisionIdentity(dependencies, request(created.userId, attribution));
  return {
    outcome: 'created',
    user: await committedView(dependencies, created.userId),
    identity: identitySyncOutcome(provisioned.identity),
    invitation: invitationOutcome(provisioned.invitation),
  };
}

/**
 * Changes a user's display name, the only mutable profile field (spec Sections 9.1, 25.3). It is
 * Vertex presentation data: no Keycloak call, no session change.
 */
export async function updateDisplayName(
  dependencies: UserAdministrationDependencies,
  input: UpdateDisplayNameRequest,
  attribution: AuditAttribution,
): Promise<UpdateDisplayNameResult> {
  const userId = typeof input.userId === 'string' ? parseUserId(input.userId) : undefined;
  if (!userId?.ok) return { outcome: 'invalid', field: 'userId' };
  const expectedVersion = parseExpectedVersion(input.expectedVersion);
  if (expectedVersion === undefined) return { outcome: 'invalid', field: 'expectedVersion' };
  const displayName =
    typeof input.displayName === 'string' ? parseDisplayName(input.displayName) : undefined;
  if (!displayName?.ok) return { outcome: 'invalid', field: 'displayName' };
  return dependencies.runner.run(async ({ lifecycle, audit }) => {
    const user = await lifecycle.lockUser(userId.value);
    if (user === undefined) return { outcome: 'user-not-found' };
    if (user.version !== expectedVersion) return { outcome: 'version-conflict' };
    if (user.displayName === displayName.value) {
      return { outcome: 'unchanged', user: toUserView(user) };
    }
    const updated = await lifecycle.writeDisplayName({
      id: user.id,
      expectedVersion,
      displayName: displayName.value,
    });
    await appendUserAudit(audit, attribution, updated, 'iam.user.updated', 'SUCCEEDED', {
      before: { displayName: user.displayName },
      after: { displayName: updated.displayName },
    });
    return { outcome: 'updated', user: toUserView(updated) };
  });
}

const restriction: Readonly<
  Record<RestrictedAccessState, { action: string; sessions: SessionRevocationReason }>
> = {
  SUSPENDED: { action: 'iam.user.suspended', sessions: 'suspended' },
  DISABLED: { action: 'iam.user.disabled', sessions: 'disabled' },
  TERMINATED: { action: 'iam.user.terminated', sessions: 'terminated' },
};

/**
 * Removes access in the fail-closed order of spec Section 31.1 (IAM-R06 D-06, D-07): commit the
 * denial with `PENDING` under the System Administrator and user locks, revoke every application
 * session, then reconcile the identity. The local change is the result; a Keycloak failure leaves
 * the user denied and `FAILED`.
 */
async function restrictUser(
  dependencies: UserAdministrationDependencies,
  input: UserRequest,
  to: RestrictedAccessState,
  attribution: AuditAttribution,
): Promise<RestrictUserResult> {
  const userId = typeof input.userId === 'string' ? parseUserId(input.userId) : undefined;
  if (!userId?.ok) return { outcome: 'invalid', field: 'userId' };
  const { action, sessions } = restriction[to];

  const committed = await dependencies.runner.run(async ({ lifecycle, roles, audit }) => {
    // The System Administrator lock first, whatever the target holds: whether it holds the role
    // is only stable under that lock (IAM-R06 D-06).
    const systemRoleId = await lifecycle.lockSystemAdministratorRole();
    const user = await lifecycle.lockUser(userId.value);
    if (user === undefined) return { outcome: 'user-not-found' as const };
    const holdsSystemAdministratorRole =
      systemRoleId !== undefined &&
      (await roles.hasAssignment({ userId: user.id, roleId: systemRoleId }));
    const activeAdministrators =
      holdsSystemAdministratorRole && user.accessState === 'ACTIVE'
        ? await roles.countActiveSystemAdministrators()
        : 0;
    const decision = decideAccessRestriction({
      from: user.accessState,
      to,
      holdsSystemAdministratorRole,
      activeAdministrators,
    });
    if (decision.kind === 'refuse') {
      if (decision.reason === 'last-system-admin') {
        await audit.append(
          requireIamEvidence(attribution, {
            action,
            target: { type: 'iam.user', id: user.id },
            result: 'REFUSED',
            before: { accessState: user.accessState },
          }),
        );
      }
      return { outcome: decision.reason };
    }
    const restricted = await lifecycle.writeAccessRestriction({
      id: user.id,
      expectedVersion: user.version,
      accessState: to,
    });
    await appendUserAudit(audit, attribution, restricted, action, 'SUCCEEDED', {
      before: { accessState: user.accessState, identitySyncState: user.identitySyncState },
      after: { accessState: to, identitySyncState: 'PENDING' },
    });
    return { outcome: 'restricted' as const };
  });
  if (committed.outcome !== 'restricted') return committed;

  // Every session use re-checks accessState, so access is already denied; revocation ends the
  // sessions for good (spec Section 32). A failed revocation still lets reconciliation disable the
  // identity in Keycloak before the failure is reported (IAM-R09 D-10).
  let sessionsRevoked: number;
  try {
    sessionsRevoked = await dependencies.sessions.revokeUserSessions(
      userId.value,
      sessions,
      attribution,
    );
  } catch (revocationFailure) {
    // The revocation failure is the one reported; a reconciliation failure records its own state.
    await reconcileIdentity(dependencies, request(userId.value, attribution)).catch(
      () => undefined,
    );
    throw revocationFailure;
  }
  const identity = await reconcileIdentity(dependencies, request(userId.value, attribution));
  return {
    outcome: 'restricted',
    user: await committedView(dependencies, userId.value),
    sessionsRevoked,
    identity: identitySyncOutcome(identity),
  };
}

/**
 * The grant ceiling for reactivation (spec Section 23.1; IAM-R07 D-11), evaluated under the
 * target's row lock, which every assignment change also takes. A refusal leaves only a REFUSED
 * record.
 */
async function reactivationExceedsActor(
  roles: RoleStore,
  audit: AuditRecorder,
  attribution: AuditAttribution,
  userId: UserId,
  target: 'ACTIVE' | 'INVITED',
): Promise<boolean> {
  const grant = await roles.readUserGrant(userId);
  const exceeds = await grantExceedsActor(
    roles,
    attribution,
    grant.holdsSystemAdministratorRole
      ? { kind: 'system-role' }
      : { kind: 'permissions', codes: grant.activePermissionCodes },
  );
  if (exceeds) {
    await recordGrantRefusal(
      audit,
      attribution,
      'iam.user.reactivated',
      { type: 'iam.user', id: userId },
      { target },
    );
  }
  return exceeds;
}

/** Temporary administrative suspension (spec Section 10.3). */
export function suspendUser(
  dependencies: UserAdministrationDependencies,
  input: UserRequest,
  attribution: AuditAttribution,
): Promise<RestrictUserResult> {
  return restrictUser(dependencies, input, 'SUSPENDED', attribution);
}

/** Security or administrative disablement (spec Section 10.4). */
export function disableUser(
  dependencies: UserAdministrationDependencies,
  input: UserRequest,
  attribution: AuditAttribution,
): Promise<RestrictUserResult> {
  return restrictUser(dependencies, input, 'DISABLED', attribution);
}

/** Termination; terminal in V1, and the record and identity mapping are kept (spec Section 10.5). */
export function terminateUser(
  dependencies: UserAdministrationDependencies,
  input: UserRequest,
  attribution: AuditAttribution,
): Promise<RestrictUserResult> {
  return restrictUser(dependencies, input, 'TERMINATED', attribution);
}

/**
 * Reactivation in the order of spec Section 31.2 (IAM-R06 D-08). The backend derives the target;
 * Vertex access is granted only by the final version-checked commit, after Keycloak is ready. A
 * final commit that loses a race immediately reconciles against the committed state, so an
 * enabled identity never outlives the denial that won.
 */
export async function reactivateUser(
  dependencies: UserAdministrationDependencies,
  input: ReactivateUserRequest,
  attribution: AuditAttribution,
): Promise<ReactivateUserResult> {
  const userId = typeof input.userId === 'string' ? parseUserId(input.userId) : undefined;
  if (!userId?.ok) return { outcome: 'invalid', field: 'userId' };
  const expectedVersion = parseExpectedVersion(input.expectedVersion);
  if (expectedVersion === undefined) return { outcome: 'invalid', field: 'expectedVersion' };
  const provisioning = request(userId.value, attribution);

  // Steps 1 and 2 under the target's row lock: validate against the state the caller saw, derive
  // the target, apply the grant ceiling (IAM-R07 D-11), then PENDING, version-checked, so no
  // competing change can slip in unnoticed and no Keycloak call precedes a refusal.
  const pending = await dependencies.runner.run(async ({ lifecycle, roles, users, audit }) => {
    const locked = await lifecycle.lockUser(userId.value);
    if (locked === undefined) return { outcome: 'user-not-found' as const };
    const decision = decideReactivation(locked, expectedVersion);
    if (decision.kind === 'refuse') return { outcome: decision.reason };
    if (await reactivationExceedsActor(roles, audit, attribution, locked.id, decision.target)) {
      return { outcome: 'grant-exceeds-actor' as const };
    }
    const written = await users.recordIdentitySync({
      id: locked.id,
      expectedVersion,
      state: 'PENDING',
    });
    // The row is locked at `expectedVersion`, so the conditional write cannot miss.
    if (written.outcome !== 'updated') throw new Error('A locked user changed underneath.');
    await appendUserAudit(
      audit,
      attribution,
      written.user,
      'iam.user.reactivation-started',
      'SUCCEEDED',
      {
        before: { accessState: locked.accessState, identitySyncState: locked.identitySyncState },
        after: { identitySyncState: 'PENDING', target: decision.target },
      },
    );
    return { outcome: 'pending' as const, committed: locked, target: decision.target, written };
  });
  if (pending.outcome !== 'pending') return { outcome: pending.outcome };
  const { committed, target } = pending;

  // Step 3: Keycloak must satisfy the target's requirement before any access is granted.
  const identity = await enableIdentityForReactivation(
    dependencies,
    provisioning,
    pending.written.user,
  );
  if (identity.outcome === 'failed') {
    return { outcome: 'identity-failed', failure: identity.failure };
  }
  if (identity.outcome === 'superseded') {
    await reconcileIdentity(dependencies, provisioning);
    return { outcome: 'superseded' };
  }

  // Step 4: the final commit, conditional on the version the identity step left. If it fails
  // outright (for example a lost connection), the identity may be enabled while the user is still
  // denied: reconcile against the committed state before failing (IAM-R06 review DC-6).
  const finalCommit = dependencies.runner.run(async ({ lifecycle, roles, audit }) => {
    // The ceiling again, under the row lock of the commit that grants access: the target's roles,
    // their mappings and states may have changed while Keycloak was called (review SA-1).
    const locked = await lifecycle.lockUser(committed.id);
    if (
      locked?.version === identity.user.version &&
      (await reactivationExceedsActor(roles, audit, attribution, locked.id, target))
    ) {
      return { outcome: 'grant-exceeds-actor' as const };
    }
    const written = await lifecycle.completeReactivation({
      id: committed.id,
      expectedVersion: identity.user.version,
      accessState: target,
    });
    if (written.outcome === 'updated') {
      await appendUserAudit(audit, attribution, written.user, 'iam.user.reactivated', 'SUCCEEDED', {
        before: { accessState: committed.accessState, identitySyncState: 'PENDING' },
        after: { accessState: target, identitySyncState: 'SYNCED', steps: [...identity.steps] },
      });
    }
    return written;
  });
  const completed = await finalCommit.catch(async (error: unknown) => {
    await reconcileIdentity(dependencies, provisioning).catch(() => undefined);
    throw error;
  });
  if (completed.outcome !== 'updated') {
    // Step 6: the identity may be enabled while IAM still denies access; reconcile at once.
    await reconcileIdentity(dependencies, provisioning);
    return {
      outcome: completed.outcome === 'grant-exceeds-actor' ? completed.outcome : 'superseded',
    };
  }

  // A user returned to INVITED receives the first dispatch if none was ever attempted.
  const invitation =
    target === 'INVITED' && completed.user.invitationDeliveryState === 'NOT_SENT'
      ? invitationOutcome(
          await dispatchInvitation(dependencies, { ...provisioning, kind: 'first' }),
        )
      : ({ outcome: 'not-applicable' } as const);
  return {
    outcome: 'reactivated',
    target,
    user: await committedView(dependencies, committed.id),
    invitation,
  };
}

/**
 * Idempotent identity reconciliation in any `identitySyncState`, followed by the first invitation
 * dispatch if none was ever attempted (spec Sections 11.2, 25.3). Never changes `accessState`.
 */
export async function syncIdentity(
  dependencies: UserAdministrationDependencies,
  input: UserRequest,
  attribution: AuditAttribution,
): Promise<SyncIdentityResult> {
  const userId = typeof input.userId === 'string' ? parseUserId(input.userId) : undefined;
  if (!userId?.ok) return { outcome: 'invalid', field: 'userId' };
  const provisioned = await provisionIdentity(dependencies, request(userId.value, attribution));
  const identity = provisioned.identity;
  switch (identity.outcome) {
    case 'not-found':
      return { outcome: 'user-not-found' };
    case 'superseded':
      return { outcome: 'superseded' };
    case 'failed':
      return { outcome: 'identity-failed', failure: identity.failure };
    case 'synced':
      return {
        outcome: 'synced',
        user: await committedView(dependencies, userId.value),
        invitation: invitationOutcome(provisioned.invitation),
      };
  }
}

/** Explicit, repeatable invitation resend for an INVITED user (spec Sections 11.3, 25.3). */
export async function resendUserInvitation(
  dependencies: UserAdministrationDependencies,
  input: UserRequest,
  attribution: AuditAttribution,
): Promise<ResendUserInvitationResult> {
  const userId = typeof input.userId === 'string' ? parseUserId(input.userId) : undefined;
  if (!userId?.ok) return { outcome: 'invalid', field: 'userId' };
  const result = await resendInvitation(dependencies, request(userId.value, attribution));
  switch (result.outcome) {
    case 'sent':
    case 'no-action-required':
      return { outcome: result.outcome, user: toUserView(result.user) };
    case 'failed':
      return { outcome: 'identity-failed', failure: result.failure };
    case 'not-found':
      return { outcome: 'user-not-found' };
    case 'not-invited':
    case 'sync-incomplete':
    case 'superseded':
      return { outcome: result.outcome };
    case 'already-attempted':
      // Only a first dispatch reports this; a resend never does.
      throw new Error('A resend reported an earlier attempt.');
  }
}

/**
 * The administrator's revoke-sessions action (spec Section 32; IAM-R06 D-10): every application
 * session of the user is revoked, then the bound identity's Keycloak sessions are ended so that a
 * remaining single-sign-on cookie cannot open a new session silently. Access state and identity
 * synchronization are untouched.
 */
export async function revokeUserSessions(
  dependencies: UserAdministrationDependencies,
  input: UserRequest,
  attribution: AuditAttribution,
): Promise<RevokeUserSessionsResult> {
  const userId = typeof input.userId === 'string' ? parseUserId(input.userId) : undefined;
  if (!userId?.ok) return { outcome: 'invalid', field: 'userId' };
  const user = await dependencies.users.findById(userId.value);
  if (!user) return { outcome: 'user-not-found' };
  const sessionsRevoked = await dependencies.sessions.revokeUserSessions(
    user.id,
    'administrator',
    attribution,
  );
  const provider = dependencies.identityProvider;
  let providerSessions: ProviderSessionsOutcome = { outcome: 'no-identity' };
  if (user.identity !== undefined && user.identity.issuer === provider.issuer) {
    const terminated = await provider.terminateSessions(user.identity.subject);
    providerSessions = !terminated.ok
      ? { outcome: 'failed', failure: providerFailure(terminated.failure) }
      : terminated.value === 'not-found'
        ? { outcome: 'failed', failure: 'identity-conflict' }
        : { outcome: 'terminated' };
  }
  // One record of the administrator's action, even when nothing was live (IAM-R06 review SEC-4);
  // each revoked session also has its own record from the session store.
  await dependencies.runner.run(({ audit }) =>
    appendUserAudit(
      audit,
      attribution,
      user,
      'iam.user.sessions-revoked',
      providerSessions.outcome === 'failed' ? 'FAILED' : 'SUCCEEDED',
      {
        after: {
          sessionsRevoked,
          providerSessions: providerSessions.outcome,
          ...(providerSessions.outcome === 'failed' ? { failure: providerSessions.failure } : {}),
        },
      },
    ),
  );
  return { outcome: 'revoked', sessionsRevoked, providerSessions };
}
