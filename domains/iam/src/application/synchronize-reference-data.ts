import {
  createAuditEntry,
  type AuditChangeSide,
  type AuditRecorder,
  type TraceId,
} from '@vertex-os/audit';
import type { PermissionCode } from '../domain/codes.js';
import type { RoleId } from '../domain/identifiers.js';
import { systemAdministratorRole, type PermissionManifest } from '../domain/permission-catalog.js';
import {
  planReferenceSync,
  validatePermissionManifests,
  type ReferenceSyncPlan,
  type ReferenceSyncRefusalReason,
} from '../domain/reference-sync-plan.js';
import type { IamTransactionRunner } from './ports/iam-transaction.js';
import type { ReferenceDataStore } from './ports/reference-data-store.js';

export type ReferenceSyncResult =
  | {
      readonly outcome: 'synchronized';
      readonly changes: {
        readonly permissionsRegistered: readonly PermissionCode[];
        readonly permissionsUpdated: readonly PermissionCode[];
        /** `updated` when an existing system role changed its name, description or mappings. */
        readonly systemRole: 'created' | 'updated' | 'unchanged';
        readonly permissionsGranted: readonly PermissionCode[];
        readonly permissionsRevoked: readonly PermissionCode[];
      };
    }
  | {
      readonly outcome: 'refused';
      readonly reason: ReferenceSyncRefusalReason;
      /** Stable tokens naming codes or manifest positions only. */
      readonly details: readonly string[];
    };

/** The synchronization is a system process; callers cannot choose who it acts as. */
const ACTOR = { type: 'SYSTEM', process: 'iam.reference-sync' } as const;

class AuditTrail {
  constructor(
    private readonly recorder: AuditRecorder,
    private readonly traceId: TraceId,
  ) {}

  async record(
    action: string,
    target: { readonly type: 'iam.permission' | 'iam.role'; readonly id: string },
    change: { readonly before?: AuditChangeSide; readonly after?: AuditChangeSide },
  ): Promise<void> {
    const entry = createAuditEntry({
      sourceModule: 'iam',
      action,
      actor: ACTOR,
      target,
      result: 'SUCCEEDED',
      traceId: this.traceId,
      change,
    });
    // An invalid entry is a programming error: throwing rolls the whole run back (spec Section 50).
    if (!entry.ok) {
      throw new Error(`Reference synchronization built an invalid audit entry (${entry.reason}).`);
    }
    await this.recorder.append(entry.value);
  }
}

async function apply(
  plan: ReferenceSyncPlan,
  store: ReferenceDataStore,
  trail: AuditTrail,
): Promise<ReferenceSyncResult> {
  if (plan.register.length > 0) {
    await store.registerPermissions(plan.register);
    for (const permission of plan.register) {
      await trail.record(
        'iam.permission.registered',
        { type: 'iam.permission', id: permission.code },
        {
          after: {
            owningModule: permission.owningModule,
            name: permission.name,
            description: permission.description,
            state: permission.state,
            sensitivity: permission.sensitivity,
          },
        },
      );
    }
  }
  for (const change of plan.update) {
    await store.updatePermission({ code: change.code, fields: change.after });
    await trail.record(
      'iam.permission.updated',
      { type: 'iam.permission', id: change.code },
      { before: change.before, after: change.after },
    );
  }

  let roleId: RoleId;
  const role = plan.systemRole;
  if (role.kind === 'create') {
    roleId = (await store.createSystemRole(role.definition)).id;
    await trail.record(
      'iam.role.created',
      { type: 'iam.role', id: roleId },
      {
        after: {
          code: role.definition.code,
          name: role.definition.name,
          description: role.definition.description,
          state: 'ACTIVE',
          isSystem: true,
        },
      },
    );
  } else {
    roleId = role.roleId;
    if (role.kind === 'update') {
      await store.updateSystemRole({ id: role.roleId, fields: role.after });
      await trail.record(
        'iam.role.updated',
        { type: 'iam.role', id: role.roleId },
        { before: role.before, after: role.after },
      );
    }
  }

  if (plan.revoke.length > 0) {
    await store.revokeSystemRolePermissions({ roleId, codes: plan.revoke });
    await trail.record(
      'iam.role.permissions-revoked',
      { type: 'iam.role', id: roleId },
      { before: { permissionCodes: plan.revoke } },
    );
  }
  if (plan.grant.length > 0) {
    await store.grantSystemRolePermissions({ roleId, codes: plan.grant });
    await trail.record(
      'iam.role.permissions-granted',
      { type: 'iam.role', id: roleId },
      { after: { permissionCodes: plan.grant } },
    );
  }
  if (plan.versionBump) await store.incrementSystemRoleVersion(plan.versionBump);

  return {
    outcome: 'synchronized',
    changes: {
      permissionsRegistered: plan.register.map((permission) => permission.code),
      permissionsUpdated: plan.update.map((change) => change.code),
      systemRole: role.kind === 'create' ? 'created' : plan.versionBump ? 'updated' : 'unchanged',
      permissionsGranted: plan.grant,
      permissionsRevoked: plan.revoke,
    },
  };
}

/**
 * Converges IAM's stored permission catalog and the protected System Administrator role to the
 * declared manifests (spec Sections 18–20, 48). Manifests are validated before any I/O. One
 * serialized transaction then takes the synchronization lock, reads the current state, plans, and
 * applies exactly the planned changes with one Audit record per change. A converged run writes
 * nothing; a refused run changes nothing and records no Audit evidence (IAM-02 D-11, I-7).
 */
export async function synchronizeIamReferenceData(
  dependencies: { readonly runner: IamTransactionRunner },
  request: { readonly manifests: readonly PermissionManifest[]; readonly traceId: TraceId },
): Promise<ReferenceSyncResult> {
  const validated = validatePermissionManifests(request.manifests);
  if (!validated.ok) {
    return { outcome: 'refused', reason: 'invalid-manifest', details: validated.details };
  }
  return dependencies.runner.run(async ({ referenceData, audit }) => {
    await referenceData.acquireSynchronizationLock();
    const snapshot = await referenceData.readSnapshot();
    const planned = planReferenceSync(validated.permissions, systemAdministratorRole, snapshot);
    if (planned.outcome === 'refused') {
      return { outcome: 'refused', reason: planned.reason, details: planned.details };
    }
    return apply(planned.plan, referenceData, new AuditTrail(audit, request.traceId));
  });
}
