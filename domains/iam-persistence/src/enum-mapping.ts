import {
  IamIdentitySyncState,
  IamInvitationDeliveryState,
  IamPermissionSensitivity,
  IamPermissionState,
  type IamRoleState,
  IamUserAccessState,
} from '@vertex-os/database/iam';
import type {
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
