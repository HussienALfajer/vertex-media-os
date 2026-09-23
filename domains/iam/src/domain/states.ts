export const userAccessStates = [
  'INVITED',
  'ACTIVE',
  'SUSPENDED',
  'DISABLED',
  'TERMINATED',
] as const;
export type UserAccessState = (typeof userAccessStates)[number];

export const identitySyncStates = ['PENDING', 'SYNCED', 'FAILED'] as const;
export type IdentitySyncState = (typeof identitySyncStates)[number];

export const invitationDeliveryStates = ['NOT_SENT', 'SENT', 'FAILED'] as const;
export type InvitationDeliveryState = (typeof invitationDeliveryStates)[number];

export const departmentStates = ['ACTIVE', 'INACTIVE'] as const;
export type DepartmentState = (typeof departmentStates)[number];

export const roleStates = ['ACTIVE', 'INACTIVE'] as const;
export type RoleState = (typeof roleStates)[number];

export const permissionStates = ['ACTIVE', 'DEPRECATED', 'RETIRED'] as const;
export type PermissionState = (typeof permissionStates)[number];

export const permissionSensitivities = ['STANDARD', 'SENSITIVE', 'PRIVILEGED'] as const;
export type PermissionSensitivity = (typeof permissionSensitivities)[number];
