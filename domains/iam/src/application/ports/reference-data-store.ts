import type { PermissionCode } from '../../domain/codes.js';
import type { RoleId } from '../../domain/identifiers.js';
import type { SystemRoleDefinition } from '../../domain/permission-catalog.js';
import type {
  DeclaredPermission,
  PermissionFieldValues,
  ReferenceSnapshot,
  RoleFieldValues,
} from '../../domain/reference-sync-plan.js';

/**
 * IAM's reference-data persistence inside one IAM transaction. It offers exactly the change kinds a
 * synchronization plan contains, never an "upsert everything": a converged run calls none of the
 * write operations. Custom roles are neither read nor written.
 */
export interface ReferenceDataStore {
  /** Serializes synchronization runs until the transaction ends. Called before `readSnapshot`. */
  acquireSynchronizationLock(): Promise<void>;
  /** Every persisted permission, and every role with the reserved code or `is_system`. */
  readSnapshot(): Promise<ReferenceSnapshot>;
  registerPermissions(permissions: readonly DeclaredPermission[]): Promise<void>;
  updatePermission(change: {
    readonly code: PermissionCode;
    readonly fields: PermissionFieldValues;
  }): Promise<void>;
  /** Creates the system role: `is_system`, ACTIVE, version 1. */
  createSystemRole(definition: SystemRoleDefinition): Promise<{ readonly id: RoleId }>;
  updateSystemRole(change: {
    readonly id: RoleId;
    readonly fields: RoleFieldValues;
  }): Promise<void>;
  grantSystemRolePermissions(change: {
    readonly roleId: RoleId;
    readonly codes: readonly PermissionCode[];
  }): Promise<void>;
  revokeSystemRolePermissions(change: {
    readonly roleId: RoleId;
    readonly codes: readonly PermissionCode[];
  }): Promise<void>;
  /** Raises the version by exactly one, conditional on `expectedVersion`; fails loudly otherwise. */
  incrementSystemRoleVersion(change: {
    readonly roleId: RoleId;
    readonly expectedVersion: number;
  }): Promise<void>;
}
