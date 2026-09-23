import type { AuditEntry, AuditRecorder } from '@vertex-os/audit';
import type { PermissionCode } from '../src/domain/codes.js';
import type { RoleId } from '../src/domain/identifiers.js';
import type {
  IamTransactionRunner,
  IamTransactionScope,
  PersistedPermission,
  PersistedSystemRole,
  ReferenceDataStore,
  ReferenceSnapshot,
} from '../src/persistence.js';

export const FAKE_ROLE_ID = '6f1e0c64-2f4b-4f6e-9b76-2b8a2d1f6a10' as RoleId;

type MutableRole = { -readonly [K in keyof PersistedSystemRole]: PersistedSystemRole[K] };

/** In-memory ReferenceDataStore that logs every call in order. */
export class InMemoryReferenceStore implements ReferenceDataStore {
  readonly calls: string[] = [];
  readonly permissions = new Map<string, PersistedPermission>();
  roles: MutableRole[] = [];

  constructor(snapshot: ReferenceSnapshot = { permissions: [], systemRoles: [] }) {
    for (const permission of snapshot.permissions)
      this.permissions.set(permission.code, permission);
    this.roles = snapshot.systemRoles.map((role) => ({
      ...role,
      permissionCodes: [...role.permissionCodes],
    }));
  }

  async acquireSynchronizationLock(): Promise<void> {
    this.calls.push('lock');
  }

  async readSnapshot(): Promise<ReferenceSnapshot> {
    this.calls.push('read');
    return {
      permissions: [...this.permissions.values()],
      systemRoles: this.roles.map((role) => ({
        ...role,
        permissionCodes: [...role.permissionCodes],
      })),
    };
  }

  async registerPermissions(permissions: readonly PersistedPermission[]): Promise<void> {
    this.calls.push(`register:${permissions.map((permission) => permission.code).join(',')}`);
    for (const permission of permissions) this.permissions.set(permission.code, permission);
  }

  async updatePermission(
    change: Parameters<ReferenceDataStore['updatePermission']>[0],
  ): Promise<void> {
    this.calls.push(`update:${change.code}`);
    const existing = this.permissions.get(change.code);
    if (!existing) throw new Error('unknown permission');
    this.permissions.set(change.code, { ...existing, ...change.fields });
  }

  async createSystemRole(
    definition: Parameters<ReferenceDataStore['createSystemRole']>[0],
  ): Promise<{ readonly id: RoleId }> {
    this.calls.push('create-role');
    this.roles.push({
      id: FAKE_ROLE_ID,
      code: definition.code,
      name: definition.name,
      description: definition.description,
      state: 'ACTIVE',
      isSystem: true,
      version: 1,
      permissionCodes: [],
    });
    return { id: FAKE_ROLE_ID };
  }

  async updateSystemRole(
    change: Parameters<ReferenceDataStore['updateSystemRole']>[0],
  ): Promise<void> {
    this.calls.push('update-role');
    const role = this.role(change.id);
    if (change.fields.name !== undefined) role.name = change.fields.name;
    if (change.fields.description !== undefined) {
      role.description = change.fields.description ?? undefined;
    }
  }

  async grantSystemRolePermissions(change: {
    readonly roleId: RoleId;
    readonly codes: readonly PermissionCode[];
  }): Promise<void> {
    this.calls.push(`grant:${change.codes.join(',')}`);
    const role = this.role(change.roleId);
    role.permissionCodes = [...role.permissionCodes, ...change.codes];
  }

  async revokeSystemRolePermissions(change: {
    readonly roleId: RoleId;
    readonly codes: readonly PermissionCode[];
  }): Promise<void> {
    this.calls.push(`revoke:${change.codes.join(',')}`);
    const role = this.role(change.roleId);
    role.permissionCodes = role.permissionCodes.filter((code) => !change.codes.includes(code));
  }

  async incrementSystemRoleVersion(change: {
    readonly roleId: RoleId;
    readonly expectedVersion: number;
  }): Promise<void> {
    this.calls.push(`bump:${change.expectedVersion}`);
    const role = this.role(change.roleId);
    if (role.version !== change.expectedVersion) throw new Error('version conflict');
    role.version += 1;
  }

  private role(id: RoleId): MutableRole {
    const role = this.roles.find((candidate) => candidate.id === id);
    if (!role) throw new Error('unknown role');
    return role;
  }
}

/** AuditRecorder that keeps every appended entry, optionally failing on the n-th append. */
export class RecordingAuditRecorder implements AuditRecorder {
  readonly entries: AuditEntry[] = [];

  constructor(private readonly failOnAppend?: number) {}

  async append(entry: AuditEntry): Promise<void> {
    if (this.failOnAppend === this.entries.length + 1) throw new Error('append failed');
    this.entries.push(entry);
  }
}

/** Runs work directly against the fakes (no transaction semantics). */
export function fakeRunner(
  store: InMemoryReferenceStore,
  audit: AuditRecorder,
): IamTransactionRunner & { runs: number } {
  const runner = {
    runs: 0,
    async run<T>(work: (scope: IamTransactionScope) => Promise<T>): Promise<T> {
      runner.runs += 1;
      return work({ referenceData: store, audit });
    },
  };
  return runner;
}
