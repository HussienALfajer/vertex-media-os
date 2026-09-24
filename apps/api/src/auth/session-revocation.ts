import type { AuditAttribution } from '@vertex-os/audit';
import type { AuthRuntime } from './auth-runtime.js';
import type { RevocationReason } from './session-store.js';

/**
 * The authentication area's revocation of every live session of a user, for IAM user
 * administration (IAM-R07 D-09; IAM-R06 review AB-1). It is bound to `AuthRuntime.sessions`, so
 * the HTTP runtime revokes through the same service that checks sessions; `AuthRuntime` itself
 * stays private to the authentication module.
 */
export interface UserSessionRevocation {
  revokeUserSessions(
    userId: string,
    reason: RevocationReason,
    attribution: AuditAttribution,
  ): Promise<number>;
}

/** Injection token of {@link UserSessionRevocation}. */
export const USER_SESSION_REVOCATION = Symbol('USER_SESSION_REVOCATION');

export function createUserSessionRevocation(runtime: AuthRuntime): UserSessionRevocation {
  return Object.freeze({
    revokeUserSessions: (userId: string, reason: RevocationReason, attribution: AuditAttribution) =>
      runtime.sessions.revokeUserSessions(userId, reason, attribution),
  });
}
