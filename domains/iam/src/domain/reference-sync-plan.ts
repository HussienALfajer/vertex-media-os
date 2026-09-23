import type { RoleId } from './identifiers.js';
import {
  parseModuleCode,
  parsePermissionCode,
  type ModuleCode,
  type PermissionCode,
  type RoleCode,
} from './codes.js';
import {
  SYSTEM_ADMINISTRATOR_ROLE_CODE,
  type PermissionManifest,
  type SystemRoleDefinition,
} from './permission-catalog.js';
import {
  permissionSensitivities,
  permissionStates,
  type PermissionSensitivity,
  type PermissionState,
  type RoleState,
} from './states.js';
import { parseDescription, parseEntityName, type Description, type EntityName } from './text.js';

/** A declared permission after validation. */
export interface DeclaredPermission {
  readonly code: PermissionCode;
  readonly owningModule: ModuleCode;
  readonly name: EntityName;
  readonly description: Description;
  readonly state: PermissionState;
  readonly sensitivity: PermissionSensitivity;
}

/** A permission row as persisted (the adapter maps it; every field is read). */
export type PersistedPermission = DeclaredPermission;

/** A role holding the reserved code or `is_system = true`, with its current mapping codes. */
export interface PersistedSystemRole {
  readonly id: RoleId;
  readonly code: RoleCode;
  readonly name: EntityName;
  readonly description: Description | undefined;
  readonly state: RoleState;
  readonly isSystem: boolean;
  readonly version: number;
  readonly permissionCodes: readonly PermissionCode[];
}

/** Everything synchronization reads, taken after the synchronization lock. Custom roles are absent. */
export interface ReferenceSnapshot {
  readonly permissions: readonly PersistedPermission[];
  readonly systemRoles: readonly PersistedSystemRole[];
}

export type PermissionFieldValues = Partial<
  Pick<DeclaredPermission, 'name' | 'description' | 'state' | 'sensitivity'>
>;

export interface PermissionUpdate {
  readonly code: PermissionCode;
  readonly before: PermissionFieldValues;
  readonly after: PermissionFieldValues;
}

export type RoleFieldValues = {
  readonly name?: EntityName;
  readonly description?: Description | null;
};

export type SystemRolePlan =
  | { readonly kind: 'create'; readonly definition: SystemRoleDefinition }
  | {
      readonly kind: 'update';
      readonly roleId: RoleId;
      readonly before: RoleFieldValues;
      readonly after: RoleFieldValues;
    }
  | { readonly kind: 'unchanged'; readonly roleId: RoleId };

/** Exactly the changes one synchronization run applies. An empty plan writes nothing. */
export interface ReferenceSyncPlan {
  readonly register: readonly DeclaredPermission[];
  readonly update: readonly PermissionUpdate[];
  readonly systemRole: SystemRolePlan;
  /** Sorted codes to map to the system role. */
  readonly grant: readonly PermissionCode[];
  /** Sorted codes to unmap from the system role. */
  readonly revoke: readonly PermissionCode[];
  /** Set when an existing system role changed: its version rises by exactly one (IAM-02 I-6). */
  readonly versionBump: { readonly roleId: RoleId; readonly expectedVersion: number } | undefined;
}

export type ReferenceSyncRefusalReason =
  | 'invalid-manifest'
  | 'undeclared-permissions'
  | 'retired-permission-reactivated'
  | 'system-role-conflict';

export type ReferenceSyncPlanResult =
  | { readonly outcome: 'planned'; readonly plan: ReferenceSyncPlan }
  | {
      readonly outcome: 'refused';
      readonly reason: ReferenceSyncRefusalReason;
      readonly details: readonly string[];
    };

export type ManifestValidation =
  | { readonly ok: true; readonly permissions: readonly DeclaredPermission[] }
  | { readonly ok: false; readonly details: readonly string[] };

const byCode = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

function canonicalText<T extends string>(
  value: unknown,
  parse: (input: string) => { readonly ok: true; readonly value: T } | { readonly ok: false },
): T | 'invalid' | 'non-canonical' {
  if (typeof value !== 'string') return 'invalid';
  const parsed = parse(value);
  if (!parsed.ok) return 'invalid';
  return parsed.value === value ? parsed.value : 'non-canonical';
}

/**
 * Validates the declared manifests before any I/O. Detail tokens name a code or a manifest
 * position, never free text: a malformed value is identified by where it is, not echoed.
 */
export function validatePermissionManifests(
  manifests: readonly PermissionManifest[],
): ManifestValidation {
  const details: string[] = [];
  const modules = new Set<string>();
  const codes = new Set<string>();
  const permissions: DeclaredPermission[] = [];
  manifests.forEach((manifest, manifestIndex) => {
    const module = parseModuleCode(typeof manifest?.module === 'string' ? manifest.module : '');
    if (!module.ok) {
      details.push(`invalid-module:manifest-${manifestIndex}`);
      return;
    }
    if (modules.has(module.value)) {
      details.push(`duplicate-module:${module.value}`);
      return;
    }
    modules.add(module.value);
    const declared = Array.isArray(manifest.permissions) ? manifest.permissions : [];
    if (!Array.isArray(manifest.permissions)) details.push(`invalid-permissions:${module.value}`);
    declared.forEach((definition, index) => {
      const rawCode: unknown = definition?.code;
      const code = parsePermissionCode(typeof rawCode === 'string' ? rawCode : '', module.value);
      if (!code.ok) {
        details.push(
          code.reason === 'wrong-module'
            ? `wrong-module:${String(rawCode)}`
            : `invalid-code:${module.value}#${index}`,
        );
        return;
      }
      if (codes.has(code.value)) {
        details.push(`duplicate-code:${code.value}`);
        return;
      }
      codes.add(code.value);
      const name = canonicalText(definition.name, parseEntityName);
      const description = canonicalText(definition.description, parseDescription);
      const state = permissionStates.find((allowed) => allowed === definition.state);
      const sensitivity = permissionSensitivities.find(
        (allowed) => allowed === definition.sensitivity,
      );
      const problems = [
        ...(name === 'invalid' || name === 'non-canonical' ? [`${name}-name:${code.value}`] : []),
        ...(description === 'invalid' || description === 'non-canonical'
          ? [`${description}-description:${code.value}`]
          : []),
        ...(state === undefined ? [`invalid-state:${code.value}`] : []),
        ...(sensitivity === undefined ? [`invalid-sensitivity:${code.value}`] : []),
      ];
      if (problems.length > 0) {
        details.push(...problems);
        return;
      }
      permissions.push({
        code: code.value,
        owningModule: module.value,
        name: name as EntityName,
        description: description as Description,
        state: state as PermissionState,
        sensitivity: sensitivity as PermissionSensitivity,
      });
    });
  });
  return details.length > 0 ? { ok: false, details } : { ok: true, permissions };
}

function refused(
  reason: ReferenceSyncRefusalReason,
  details: readonly string[],
): ReferenceSyncPlanResult {
  return { outcome: 'refused', reason, details: [...details].sort(byCode) };
}

/**
 * Plans one synchronization run (IAM-02 Section 23.1) as a pure function of the validated
 * declarations, the system-role definition and a snapshot read after the lock. Refusals are
 * decided before any change is planned, and a refused plan contains no changes.
 */
export function planReferenceSync(
  declared: readonly DeclaredPermission[],
  role: SystemRoleDefinition,
  snapshot: ReferenceSnapshot,
): ReferenceSyncPlanResult {
  const declaredByCode = new Map(declared.map((permission) => [permission.code, permission]));
  const persistedByCode = new Map(
    snapshot.permissions.map((permission) => [permission.code, permission]),
  );

  // (1) Data alone cannot introduce a code: every persisted code must still be declared.
  const undeclared = snapshot.permissions
    .filter((permission) => !declaredByCode.has(permission.code))
    .map((permission) => permission.code);
  if (undeclared.length > 0) return refused('undeclared-permissions', undeclared);

  // (2) RETIRED is terminal.
  const reactivated = snapshot.permissions
    .filter(
      (permission) =>
        permission.state === 'RETIRED' && declaredByCode.get(permission.code)?.state !== 'RETIRED',
    )
    .map((permission) => permission.code);
  if (reactivated.length > 0) return refused('retired-permission-reactivated', reactivated);

  // (3) At most one system role, carrying the reserved code, active. The database makes any
  // other shape unreachable (iam_role_system_code_ck, iam_role_system_active_ck); refusing keeps
  // the planner total and never converts or adopts a role.
  const roles = snapshot.systemRoles;
  const conflicting =
    roles.length > 1 ||
    roles.some(
      (existing) =>
        existing.code !== SYSTEM_ADMINISTRATOR_ROLE_CODE ||
        !existing.isSystem ||
        existing.state !== 'ACTIVE',
    );
  if (conflicting)
    return refused(
      'system-role-conflict',
      roles.map((existing) => existing.code),
    );

  // (4) Register what is declared but absent, RETIRED included.
  const register = declared
    .filter((permission) => !persistedByCode.has(permission.code))
    .sort((left, right) => byCode(left.code, right.code));

  // (5) Update exactly the differing metadata and state fields.
  const update: PermissionUpdate[] = [];
  for (const persisted of [...snapshot.permissions].sort((left, right) =>
    byCode(left.code, right.code),
  )) {
    const wanted = declaredByCode.get(persisted.code);
    if (!wanted) continue;
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const field of ['name', 'description', 'state', 'sensitivity'] as const) {
      if (persisted[field] !== wanted[field]) {
        before[field] = persisted[field];
        after[field] = wanted[field];
      }
    }
    if (Object.keys(after).length > 0) {
      update.push({
        code: persisted.code,
        before: before as PermissionFieldValues,
        after: after as PermissionFieldValues,
      });
    }
  }

  // (8) The system role holds exactly the codes whose post-plan state is ACTIVE.
  const target = new Set(
    declared
      .filter((permission) => permission.state === 'ACTIVE')
      .map((permission) => permission.code),
  );
  const existing = roles[0];
  const current = new Set(existing?.permissionCodes ?? []);
  const grant = [...target].filter((code) => !current.has(code)).sort(byCode);
  const revoke = [...current].filter((code) => !target.has(code)).sort(byCode);

  // (6) Create the role, or (7) repair drift in its name and description.
  let systemRole: SystemRolePlan;
  if (!existing) {
    systemRole = { kind: 'create', definition: role };
  } else {
    const before: { name?: EntityName; description?: Description | null } = {};
    const after: { name?: EntityName; description?: Description | null } = {};
    if (existing.name !== role.name) {
      before.name = existing.name;
      after.name = role.name;
    }
    if (existing.description !== role.description) {
      before.description = existing.description ?? null;
      after.description = role.description;
    }
    systemRole =
      Object.keys(after).length > 0
        ? { kind: 'update', roleId: existing.id, before, after }
        : { kind: 'unchanged', roleId: existing.id };
  }

  // (9) An existing role that changed gets exactly one version increment.
  const versionBump =
    existing && (systemRole.kind === 'update' || grant.length > 0 || revoke.length > 0)
      ? { roleId: existing.id, expectedVersion: existing.version }
      : undefined;

  return { outcome: 'planned', plan: { register, update, systemRole, grant, revoke, versionBump } };
}
