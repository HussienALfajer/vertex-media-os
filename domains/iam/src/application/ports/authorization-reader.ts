import type { AuthorizationFacts } from '../../domain/authorization-context.js';
import type { UserId } from '../../domain/identifiers.js';

/** Reads the committed facts the authorization context is projected from (IAM-R04 D-07). */
export interface AuthorizationReader {
  /**
   * The user's access state, memberships and role-permission grants with their states, read as
   * one consistent snapshot outside any transaction; `undefined` when no such user exists.
   */
  readAuthorizationFacts(userId: UserId): Promise<AuthorizationFacts | undefined>;
}
