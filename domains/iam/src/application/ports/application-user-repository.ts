import type { ApplicationUser } from '../../domain/application-user.js';
import type { UserId } from '../../domain/identifiers.js';

/**
 * Reads of committed users outside any transaction. Users are created and changed only inside
 * IAM transactions, together with their Audit evidence (IAM-R06 D-04).
 */
export interface ApplicationUserRepository {
  findById(id: UserId): Promise<ApplicationUser | undefined>;
  /** The committed user bound to exactly this issuer and subject (spec Section 13 step 8). */
  findByIdentity(identity: {
    readonly issuer: string;
    readonly subject: string;
  }): Promise<ApplicationUser | undefined>;
}
