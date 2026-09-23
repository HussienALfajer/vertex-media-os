import type { ApplicationUser } from '../domain/application-user.js';
import type { UserAccessState } from '../domain/states.js';
import {
  invitationActions,
  type ExternalIdentity,
  type InvitationAction,
} from './ports/identity-provider.js';

/**
 * What IAM requires of the Keycloak identity for an access state (spec Section 11.1): INVITED and
 * ACTIVE users need an existing, linked, enabled identity; for the denied states none is created
 * and an owned one is disabled with its sessions ended.
 */
export function requiredIdentityState(accessState: UserAccessState): 'enabled' | 'disabled' {
  return accessState === 'INVITED' || accessState === 'ACTIVE' ? 'enabled' : 'disabled';
}

/**
 * Ownership proof before any access-increasing step (spec Section 11.2, step 2): the username is
 * the user's normalized email, `vertexUserId` is exactly the user's ID, and a bound subject
 * matches. Email is evidence here, never a sign-in key.
 */
export function provesOwnership(identity: ExternalIdentity, user: ApplicationUser): boolean {
  return (
    identity.username === user.email &&
    identity.vertexUserIds.length === 1 &&
    identity.vertexUserIds[0] === user.id &&
    (user.identity === undefined || identity.subject === user.identity.subject)
  );
}

/**
 * The required actions an invitation asks for: only the factors the identity has not yet
 * established. A first invitation to a fresh identity asks for all three; a resend never replaces
 * an enrolled password or OTP, so the mailbox alone cannot take over an enrolled identity.
 */
export function outstandingInvitationActions(
  identity: Pick<ExternalIdentity, 'emailVerified'>,
  factors: { readonly password: boolean; readonly otp: boolean },
): InvitationAction[] {
  const outstanding: Record<InvitationAction, boolean> = {
    VERIFY_EMAIL: !identity.emailVerified,
    UPDATE_PASSWORD: !factors.password,
    CONFIGURE_TOTP: !factors.otp,
  };
  return invitationActions.filter((action) => outstanding[action]);
}
