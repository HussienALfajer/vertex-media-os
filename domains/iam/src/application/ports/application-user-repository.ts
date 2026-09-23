import type { ApplicationUser, NewApplicationUser } from '../../domain/application-user.js';
import type { UserId } from '../../domain/identifiers.js';
import type { DisplayName } from '../../domain/text.js';

export type CreateApplicationUserResult =
  | { readonly outcome: 'created'; readonly user: ApplicationUser }
  | { readonly outcome: 'email-conflict' }
  | { readonly outcome: 'unknown-reference' };

export type UpdateDisplayNameResult =
  | { readonly outcome: 'updated'; readonly user: ApplicationUser }
  | { readonly outcome: 'not-found' }
  | { readonly outcome: 'version-conflict' };

export interface ApplicationUserRepository {
  create(draft: NewApplicationUser): Promise<CreateApplicationUserResult>;
  findById(id: UserId): Promise<ApplicationUser | undefined>;
  /** The committed user bound to exactly this issuer and subject (spec Section 13 step 8). */
  findByIdentity(identity: {
    readonly issuer: string;
    readonly subject: string;
  }): Promise<ApplicationUser | undefined>;
  updateDisplayName(change: {
    readonly id: UserId;
    readonly expectedVersion: number;
    readonly displayName: DisplayName;
  }): Promise<UpdateDisplayNameResult>;
}
