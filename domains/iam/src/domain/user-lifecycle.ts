import type { ApplicationUser } from './application-user.js';
import { projectAuthorizationContext, type AuthorizationFacts } from './authorization-context.js';
import type { PermissionCode } from './codes.js';
import type { NormalizedEmail } from './email.js';
import type { UserId } from './identifiers.js';
import type { DisplayName } from './text.js';
import type { IdentitySyncState, InvitationDeliveryState, UserAccessState } from './states.js';

/** A user as administration returns it (spec Section 9.1), without the identity mapping (IAM-R06 D-18). */
export interface UserView {
  readonly id: UserId;
  readonly email: NormalizedEmail;
  readonly displayName: DisplayName;
  readonly accessState: UserAccessState;
  readonly identitySyncState: IdentitySyncState;
  readonly invitationDeliveryState: InvitationDeliveryState;
  readonly invitationSentAt: Date | undefined;
  readonly firstActivatedAt: Date | undefined;
  readonly lastAccessStateChangedAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export function toUserView(user: ApplicationUser): UserView {
  return Object.freeze({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    accessState: user.accessState,
    identitySyncState: user.identitySyncState,
    invitationDeliveryState: user.invitationDeliveryState,
    invitationSentAt: user.invitationSentAt,
    firstActivatedAt: user.firstActivatedAt,
    lastAccessStateChangedAt: user.lastAccessStateChangedAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    version: user.version,
  });
}

/** The states an administrator can move a user to by removing access (spec Section 10.6). */
export type RestrictedAccessState = 'SUSPENDED' | 'DISABLED' | 'TERMINATED';

const restrictions: Readonly<Record<UserAccessState, readonly RestrictedAccessState[]>> = {
  INVITED: ['SUSPENDED', 'DISABLED', 'TERMINATED'],
  ACTIVE: ['SUSPENDED', 'DISABLED', 'TERMINATED'],
  SUSPENDED: ['DISABLED', 'TERMINATED'],
  DISABLED: ['TERMINATED'],
  TERMINATED: [],
};

export type AccessRestrictionDecision =
  | { readonly kind: 'restrict' }
  | { readonly kind: 'refuse'; readonly reason: 'invalid-access-transition' | 'last-system-admin' };

/**
 * Removing access (spec Sections 10.6, 20): only the transitions of the table, each towards less
 * access. An ACTIVE holder of the System Administrator role may leave ACTIVE only while another
 * ACTIVE holder remains; `activeAdministrators` is counted under the System Administrator role
 * lock and includes the target (IAM-R06 D-06).
 */
export function decideAccessRestriction(input: {
  readonly from: UserAccessState;
  readonly to: RestrictedAccessState;
  readonly holdsSystemAdministratorRole: boolean;
  readonly activeAdministrators: number;
}): AccessRestrictionDecision {
  if (!restrictions[input.from].includes(input.to)) {
    return { kind: 'refuse', reason: 'invalid-access-transition' };
  }
  if (
    input.from === 'ACTIVE' &&
    input.holdsSystemAdministratorRole &&
    input.activeAdministrators <= 1
  ) {
    return { kind: 'refuse', reason: 'last-system-admin' };
  }
  return { kind: 'restrict' };
}

export type ReactivationDecision =
  | { readonly kind: 'reactivate'; readonly target: 'ACTIVE' | 'INVITED' }
  | { readonly kind: 'refuse'; readonly reason: 'invalid-access-transition' | 'version-conflict' };

/**
 * Reactivation (spec Section 10.7): only SUSPENDED or DISABLED users, at the version the caller
 * saw. The backend derives the target: ACTIVE after a completed first activation, INVITED
 * otherwise, so no administrative path makes a never-activated user ACTIVE.
 */
export function decideReactivation(
  user: Pick<ApplicationUser, 'accessState' | 'firstActivatedAt' | 'version'>,
  expectedVersion: number,
): ReactivationDecision {
  if (user.accessState !== 'SUSPENDED' && user.accessState !== 'DISABLED') {
    return { kind: 'refuse', reason: 'invalid-access-transition' };
  }
  if (user.version !== expectedVersion) return { kind: 'refuse', reason: 'version-conflict' };
  return { kind: 'reactivate', target: user.firstActivatedAt === undefined ? 'INVITED' : 'ACTIVE' };
}

/** Who asks for a grant, as the grant ceiling sees them (spec Section 23.1). */
export type GrantActor =
  | { readonly kind: 'system' }
  | {
      readonly kind: 'user';
      readonly userId: UserId;
      /** `undefined` when no such user exists: it holds nothing. */
      readonly facts: AuthorizationFacts | undefined;
      readonly holdsSystemAdministratorRole: boolean;
    };

/** What a change grants: the protected system role, or the ACTIVE permissions it makes reachable. */
export type Grant =
  | { readonly kind: 'system-role' }
  | { readonly kind: 'permissions'; readonly codes: readonly PermissionCode[] };

/**
 * The grant ceiling (spec Section 23.1; owner decision 2026-09-24): no administrator grants more
 * than they hold. A system process and an ACTIVE System Administrator are not limited; any other
 * actor may never grant the system role and may grant only permissions that are among their own
 * effective permissions (IAM-R04 D-06 effectiveness rules).
 */
export function exceedsGrantCeiling(actor: GrantActor, grant: Grant): boolean {
  if (actor.kind === 'system') return false;
  const context =
    actor.facts === undefined ? undefined : projectAuthorizationContext(actor.userId, actor.facts);
  if (context !== undefined && actor.holdsSystemAdministratorRole) return false;
  if (grant.kind === 'system-role') return true;
  const held = new Set(context?.permissionCodes ?? []);
  return grant.codes.some((code) => !held.has(code));
}

/** A holder of the System Administrator role that is not TERMINATED (spec Section 21.2). */
export interface BootstrapCandidate {
  readonly id: UserId;
  readonly email: NormalizedEmail;
  readonly accessState: Exclude<UserAccessState, 'TERMINATED'>;
}

export type BootstrapRefusal = 'active-administrator-exists' | 'recovery-required' | 'email-taken';

export type BootstrapDecision =
  | { readonly kind: 'create' }
  | { readonly kind: 'resume'; readonly candidate: UserId }
  | {
      readonly kind: 'recover';
      /** INVITED candidates: terminated. */
      readonly terminate: readonly UserId[];
      /** SUSPENDED and DISABLED candidates: the System Administrator role is removed. */
      readonly strip: readonly UserId[];
    }
  | { readonly kind: 'refuse'; readonly reason: BootstrapRefusal };

/**
 * Bootstrap candidate classification (spec Sections 21.2, 21.3), from committed state only.
 * `emailInUse`: some user, of any state, already has the operator's normalized email.
 */
export function classifyBootstrap(input: {
  readonly mode: 'normal' | 'recovery';
  readonly email: NormalizedEmail;
  readonly candidates: readonly BootstrapCandidate[];
  readonly emailInUse: boolean;
}): BootstrapDecision {
  const { candidates } = input;
  if (candidates.some((candidate) => candidate.accessState === 'ACTIVE')) {
    return { kind: 'refuse', reason: 'active-administrator-exists' };
  }
  if (input.mode === 'recovery') {
    if (input.emailInUse) return { kind: 'refuse', reason: 'email-taken' };
    return {
      kind: 'recover',
      terminate: candidates
        .filter((candidate) => candidate.accessState === 'INVITED')
        .map((candidate) => candidate.id),
      strip: candidates
        .filter((candidate) => candidate.accessState !== 'INVITED')
        .map((candidate) => candidate.id),
    };
  }
  if (candidates.length === 0) {
    return input.emailInUse ? { kind: 'refuse', reason: 'email-taken' } : { kind: 'create' };
  }
  const only = candidates.length === 1 ? candidates[0] : undefined;
  if (only !== undefined && only.accessState === 'INVITED' && only.email === input.email) {
    return { kind: 'resume', candidate: only.id };
  }
  return { kind: 'refuse', reason: 'recovery-required' };
}
