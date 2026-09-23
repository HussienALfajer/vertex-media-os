import type { AuditAttribution } from '@vertex-os/audit';
import type { UserId } from '../../domain/identifiers.js';

/** Why IAM ends a user's application sessions (spec Section 32; IAM-R06 D-09). */
export type SessionRevocationReason = 'suspended' | 'disabled' | 'terminated' | 'administrator';

/**
 * Server-side revocation of every application session of a user, owned by the platform's
 * authentication area (spec Section 6.2) and bound by composition. It commits its own
 * transaction with one Audit record per revoked session, and is called only after the IAM change
 * that requires it has committed (spec Section 31.1 step 2).
 */
export interface SessionRevocation {
  /** Returns how many live sessions it revoked. */
  revokeUserSessions(
    userId: UserId,
    reason: SessionRevocationReason,
    attribution: AuditAttribution,
  ): Promise<number>;
}
