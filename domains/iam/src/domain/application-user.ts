import type { DepartmentId, RoleId, UserId } from './identifiers.js';
import { normalizeEmail, type NormalizedEmail } from './email.js';
import { parseDisplayName, type DisplayName } from './text.js';
import type { IdentitySyncState, InvitationDeliveryState, UserAccessState } from './states.js';
import type { ValidationResult } from './result.js';

export interface ApplicationUser {
  readonly id: UserId;
  readonly email: NormalizedEmail;
  readonly displayName: DisplayName;
  readonly accessState: UserAccessState;
  readonly identity: { readonly issuer: string; readonly subject: string } | undefined;
  readonly identitySyncState: IdentitySyncState;
  readonly invitationDeliveryState: InvitationDeliveryState;
  readonly invitationSentAt: Date | undefined;
  readonly firstActivatedAt: Date | undefined;
  readonly lastAccessStateChangedAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface NewApplicationUser {
  readonly email: NormalizedEmail;
  readonly displayName: DisplayName;
  readonly accessState: 'INVITED';
  readonly identitySyncState: 'PENDING';
  readonly invitationDeliveryState: 'NOT_SENT';
  readonly memberships: readonly {
    readonly departmentId: DepartmentId;
    readonly isPrimary: boolean;
  }[];
  readonly roleIds: readonly RoleId[];
}

export type NewApplicationUserReason =
  | 'invalid-email'
  | 'invalid-display-name'
  | 'duplicate-department'
  | 'multiple-primary'
  | 'duplicate-role';

export function newApplicationUser(input: {
  readonly email: string;
  readonly displayName: string;
  readonly memberships: readonly {
    readonly departmentId: DepartmentId;
    readonly isPrimary: boolean;
  }[];
  readonly roleIds: readonly RoleId[];
}): ValidationResult<NewApplicationUser, NewApplicationUserReason> {
  const email = normalizeEmail(input.email);
  if (!email.ok) return { ok: false, reason: 'invalid-email' };
  const displayName = parseDisplayName(input.displayName);
  if (!displayName.ok) return { ok: false, reason: 'invalid-display-name' };
  if (
    new Set(input.memberships.map((membership) => membership.departmentId)).size !==
    input.memberships.length
  ) {
    return { ok: false, reason: 'duplicate-department' };
  }
  if (input.memberships.filter((membership) => membership.isPrimary).length > 1) {
    return { ok: false, reason: 'multiple-primary' };
  }
  if (new Set(input.roleIds).size !== input.roleIds.length) {
    return { ok: false, reason: 'duplicate-role' };
  }
  return {
    ok: true,
    value: {
      email: email.value,
      displayName: displayName.value,
      accessState: 'INVITED',
      identitySyncState: 'PENDING',
      invitationDeliveryState: 'NOT_SENT',
      memberships: input.memberships.map((membership) => ({ ...membership })),
      roleIds: [...input.roleIds],
    },
  };
}
