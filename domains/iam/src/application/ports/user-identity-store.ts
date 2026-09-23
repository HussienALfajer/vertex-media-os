import type { ApplicationUser } from '../../domain/application-user.js';
import type { UserId } from '../../domain/identifiers.js';
import type { IdentitySyncState, InvitationDeliveryState } from '../../domain/states.js';

export type UserIdentityWriteResult =
  | { readonly outcome: 'updated'; readonly user: ApplicationUser }
  | { readonly outcome: 'version-conflict' }
  | { readonly outcome: 'not-found' };

/**
 * Version-checked writes of a user's identity mapping and synchronization states inside one IAM
 * transaction. Each write succeeds only at `expectedVersion`, increments the version by one and
 * returns the updated user.
 */
export interface UserIdentityStore {
  /**
   * Binds issuer and subject to a user that has none. `identity-taken`: another user already
   * holds that identity. A bound user is a `version-conflict`: a binding never changes.
   */
  bindIdentity(change: {
    readonly id: UserId;
    readonly expectedVersion: number;
    readonly issuer: string;
    readonly subject: string;
  }): Promise<UserIdentityWriteResult | { readonly outcome: 'identity-taken' }>;
  recordIdentitySync(change: {
    readonly id: UserId;
    readonly expectedVersion: number;
    readonly state: IdentitySyncState;
  }): Promise<UserIdentityWriteResult>;
  /**
   * Records an invitation dispatch state. `SENT` sets `invitationSentAt` to the current time;
   * `FAILED` keeps it; `NOT_SENT` is never written after creation.
   */
  recordInvitationDelivery(change: {
    readonly id: UserId;
    readonly expectedVersion: number;
    readonly state: Exclude<InvitationDeliveryState, 'NOT_SENT'>;
  }): Promise<UserIdentityWriteResult>;
}
