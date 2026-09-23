import type { AuditAttribution, AuditChangeSide, AuditRecorder } from '@vertex-os/audit';
import type { PermissionCode } from '../domain/codes.js';
import type { UserId } from '../domain/identifiers.js';
import { exceedsGrantCeiling, type Grant } from '../domain/user-lifecycle.js';
import { requireIamEvidence, type IamEvidence } from './administration-evidence.js';
import type { RoleStore } from './ports/role-store.js';

/**
 * Evaluates the grant ceiling (spec Section 23.1; IAM-R06 D-12) inside the change's transaction,
 * after its locks, against the actor's committed state. A system process is exempt.
 */
export async function grantExceedsActor(
  roles: RoleStore,
  attribution: AuditAttribution,
  grant: Grant,
): Promise<boolean> {
  if (attribution.actor.type === 'SYSTEM') return false;
  const userId = attribution.actor.userId as string as UserId;
  const authority = await roles.readActorAuthority(userId);
  return exceedsGrantCeiling({ kind: 'user', userId, ...authority }, grant);
}

/** What granting a role makes reachable: the system role itself, or its ACTIVE permissions. */
export async function roleGrant(
  roles: RoleStore,
  role: { readonly id: string; readonly isSystem: boolean },
): Promise<Grant> {
  if (role.isSystem) return { kind: 'system-role' };
  const codes: readonly PermissionCode[] = await roles.readActivePermissionCodes(
    role.id as Parameters<RoleStore['readActivePermissionCodes']>[0],
  );
  return { kind: 'permissions', codes };
}

/** The REFUSED record of a grant the ceiling stopped; nothing else is written. */
export function recordGrantRefusal(
  audit: AuditRecorder,
  attribution: AuditAttribution,
  action: string,
  target: IamEvidence['target'],
  attempted?: AuditChangeSide,
): Promise<void> {
  return audit.append(
    requireIamEvidence(attribution, {
      action,
      target,
      result: 'REFUSED',
      ...(attempted === undefined ? {} : { after: attempted }),
    }),
  );
}
