import type { ApplicationUser } from '../../domain/application-user.js';
import type { NormalizedEmail } from '../../domain/email.js';
import type { RoleId, UserId } from '../../domain/identifiers.js';
import type { DisplayName } from '../../domain/text.js';
import type { RestrictedAccessState } from '../../domain/user-lifecycle.js';
import type { UserIdentityWriteResult } from './user-identity-store.js';

/**
 * The user writes that decide access, inside one IAM transaction (IAM-R06 D-03, D-05, D-06). Lock
 * operations hold their row lock until the transaction ends; the lock order is role, user, then
 * department or permission. Writes under a lock execute decisions already taken and throw when
 * they do not affect exactly the expected row.
 */
export interface UserLifecycleStore {
  /**
   * Locks the System Administrator role row `FOR UPDATE`, found by its reserved code: the
   * serialization point of every operation that can lower the number of ACTIVE System
   * Administrators, and of bootstrap (spec Sections 20, 21.4). `undefined` before reference
   * synchronization created the role.
   */
  lockSystemAdministratorRole(): Promise<RoleId | undefined>;
  /** Locks the user row `FOR UPDATE` and returns the committed user. */
  lockUser(id: UserId): Promise<ApplicationUser | undefined>;
  holdsRole(assignment: { readonly userId: UserId; readonly roleId: RoleId }): Promise<boolean>;
  /** Whether any user, in any state, has this email. */
  emailInUse(email: NormalizedEmail): Promise<boolean>;
  /**
   * Inserts an INVITED user with the initial states of spec Section 11 at version 1. An existing
   * email, including a terminated user's, is `email-taken` without aborting the transaction.
   */
  insertUser(values: {
    readonly email: NormalizedEmail;
    readonly displayName: DisplayName;
  }): Promise<
    | { readonly outcome: 'created'; readonly user: ApplicationUser }
    | { readonly outcome: 'email-taken' }
  >;
  /**
   * Removes access on a locked user: the new state, `identitySyncState = PENDING` and
   * `lastAccessStateChangedAt` (spec Section 31.1 step 1), raising the version by one.
   */
  writeAccessRestriction(change: {
    readonly id: UserId;
    readonly expectedVersion: number;
    readonly accessState: RestrictedAccessState;
  }): Promise<ApplicationUser>;
  /**
   * The final commit of a reactivation (spec Section 31.2 step 4): the target state with
   * `identitySyncState = SYNCED`, only while the user is still SUSPENDED or DISABLED at
   * `expectedVersion`; anything else is a `version-conflict`.
   */
  completeReactivation(change: {
    readonly id: UserId;
    readonly expectedVersion: number;
    readonly accessState: 'ACTIVE' | 'INVITED';
  }): Promise<UserIdentityWriteResult>;
  /** Writes the display name of a locked user, raising the version by one. */
  writeDisplayName(change: {
    readonly id: UserId;
    readonly expectedVersion: number;
    readonly displayName: DisplayName;
  }): Promise<ApplicationUser>;
  /**
   * The holders of the role that are not TERMINATED, sorted by ID; stable while the role row is
   * locked, because assignments of the role change only under that lock.
   */
  readRoleHolders(roleId: RoleId): Promise<readonly UserId[]>;
}
