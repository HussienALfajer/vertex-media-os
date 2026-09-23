import {
  IamDepartmentState,
  IamIdentitySyncState,
  IamInvitationDeliveryState,
  IamPermissionSensitivity,
  IamPermissionState,
  IamRoleState,
  IamUserAccessState,
} from '@vertex-os/database/iam';
import type {
  DepartmentState,
  IdentitySyncState,
  InvitationDeliveryState,
  PermissionSensitivity,
  PermissionState,
  RoleState,
  UserAccessState,
} from '@vertex-os/iam/persistence';

export const accessToDatabase = {
  INVITED: IamUserAccessState.INVITED,
  ACTIVE: IamUserAccessState.ACTIVE,
  SUSPENDED: IamUserAccessState.SUSPENDED,
  DISABLED: IamUserAccessState.DISABLED,
  TERMINATED: IamUserAccessState.TERMINATED,
} satisfies Record<UserAccessState, IamUserAccessState>;

export const accessFromDatabase = {
  INVITED: 'INVITED',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  DISABLED: 'DISABLED',
  TERMINATED: 'TERMINATED',
} satisfies Record<IamUserAccessState, UserAccessState>;

export const identitySyncToDatabase = {
  PENDING: IamIdentitySyncState.PENDING,
  SYNCED: IamIdentitySyncState.SYNCED,
  FAILED: IamIdentitySyncState.FAILED,
} satisfies Record<IdentitySyncState, IamIdentitySyncState>;

export const identitySyncFromDatabase = {
  PENDING: 'PENDING',
  SYNCED: 'SYNCED',
  FAILED: 'FAILED',
} satisfies Record<IamIdentitySyncState, IdentitySyncState>;

export const invitationToDatabase = {
  NOT_SENT: IamInvitationDeliveryState.NOT_SENT,
  SENT: IamInvitationDeliveryState.SENT,
  FAILED: IamInvitationDeliveryState.FAILED,
} satisfies Record<InvitationDeliveryState, IamInvitationDeliveryState>;

export const invitationFromDatabase = {
  NOT_SENT: 'NOT_SENT',
  SENT: 'SENT',
  FAILED: 'FAILED',
} satisfies Record<IamInvitationDeliveryState, InvitationDeliveryState>;

export const permissionStateToDatabase = {
  ACTIVE: IamPermissionState.ACTIVE,
  DEPRECATED: IamPermissionState.DEPRECATED,
  RETIRED: IamPermissionState.RETIRED,
} satisfies Record<PermissionState, IamPermissionState>;

export const permissionStateFromDatabase = {
  ACTIVE: 'ACTIVE',
  DEPRECATED: 'DEPRECATED',
  RETIRED: 'RETIRED',
} satisfies Record<IamPermissionState, PermissionState>;

export const sensitivityToDatabase = {
  STANDARD: IamPermissionSensitivity.STANDARD,
  SENSITIVE: IamPermissionSensitivity.SENSITIVE,
  PRIVILEGED: IamPermissionSensitivity.PRIVILEGED,
} satisfies Record<PermissionSensitivity, IamPermissionSensitivity>;

export const sensitivityFromDatabase = {
  STANDARD: 'STANDARD',
  SENSITIVE: 'SENSITIVE',
  PRIVILEGED: 'PRIVILEGED',
} satisfies Record<IamPermissionSensitivity, PermissionSensitivity>;

export const roleStateFromDatabase = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} satisfies Record<IamRoleState, RoleState>;

export const roleStateToDatabase = {
  ACTIVE: IamRoleState.ACTIVE,
  INACTIVE: IamRoleState.INACTIVE,
} satisfies Record<RoleState, IamRoleState>;

export const departmentStateToDatabase = {
  ACTIVE: IamDepartmentState.ACTIVE,
  INACTIVE: IamDepartmentState.INACTIVE,
} satisfies Record<DepartmentState, IamDepartmentState>;

export const departmentStateFromDatabase = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} satisfies Record<IamDepartmentState, DepartmentState>;

/**
 * Maps an enum label read as text by a raw statement. An unknown label throws, so an unexpected
 * row can never be read as a permissive state.
 */
export function knownLabel<T extends string>(
  labels: Readonly<Record<string, T>>,
  value: string,
): T {
  const mapped = Object.hasOwn(labels, value) ? labels[value] : undefined;
  if (mapped === undefined) throw new Error('IAM persistence read an unknown state label.');
  return mapped;
}
