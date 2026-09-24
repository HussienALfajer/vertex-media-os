import type {
  DepartmentView,
  InvitationOutcome as IamInvitationOutcome,
  Page,
  PermissionView,
  ProviderSessionsOutcome,
  RoleDetail,
  RoleView,
  UserDetail,
  UserSummary,
  UserView,
} from '@vertex-os/iam';
import type {
  DepartmentResponse,
  InvitationOutcome,
  PermissionResponse,
  RoleDetailResponse,
  RoleResponse,
  UserDetailResponse,
  UserResponse,
  UserSummaryResponse,
} from './schemas.js';

/**
 * Views → response DTOs (IAM-R07 D-06): explicit fields only, instants as ISO 8601, absent values
 * as `null`. Nothing here can carry the identity mapping, because the views do not.
 */

const instant = (value: Date | undefined): string | null =>
  value === undefined ? null : value.toISOString();

export function toUser(user: UserView): UserResponse {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    accessState: user.accessState,
    identitySyncState: user.identitySyncState,
    invitationDeliveryState: user.invitationDeliveryState,
    invitationSentAt: instant(user.invitationSentAt),
    firstActivatedAt: instant(user.firstActivatedAt),
    lastAccessStateChangedAt: user.lastAccessStateChangedAt.toISOString(),
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    version: user.version,
  };
}

function grantsOf(user: UserSummary | UserDetail) {
  return {
    departments: user.departments.map((department) => ({
      id: department.id,
      code: department.code,
      name: department.name,
      state: department.state,
      isPrimary: department.isPrimary,
    })),
    roles: user.roles.map((role) => ({
      id: role.id,
      code: role.code,
      name: role.name,
      state: role.state,
      isSystem: role.isSystem,
    })),
  };
}

export function toUserDetail(user: UserDetail): UserDetailResponse {
  return { ...toUser(user), ...grantsOf(user) };
}

export function toUserSummary(user: UserSummary): UserSummaryResponse {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    accessState: user.accessState,
    identitySyncState: user.identitySyncState,
    invitationDeliveryState: user.invitationDeliveryState,
    ...grantsOf(user),
  };
}

export function toDepartment(department: DepartmentView): DepartmentResponse {
  return {
    id: department.id,
    code: department.code,
    name: department.name,
    description: department.description ?? null,
    state: department.state,
    version: department.version,
  };
}

export function toRole(role: RoleView): RoleResponse {
  return {
    id: role.id,
    code: role.code,
    name: role.name,
    description: role.description ?? null,
    state: role.state,
    isSystem: role.isSystem,
    version: role.version,
  };
}

export function toRoleDetail(
  role: RoleView,
  permissionCodes: RoleDetail['permissionCodes'],
): RoleDetailResponse {
  return { ...toRole(role), permissionCodes: [...permissionCodes] };
}

export function toPermission(permission: PermissionView): PermissionResponse {
  return {
    code: permission.code,
    owningModule: permission.owningModule,
    name: permission.name,
    description: permission.description,
    state: permission.state,
    sensitivity: permission.sensitivity,
  };
}

export function toPage<T, R>(page: Page<T>, map: (item: T) => R) {
  return {
    items: page.items.map(map),
    page: page.page,
    pageSize: page.pageSize,
    total: page.total,
  };
}

const invitations: Readonly<Record<IamInvitationOutcome['outcome'], InvitationOutcome>> = {
  sent: 'SENT',
  failed: 'FAILED',
  'no-action-required': 'NO_ACTION_REQUIRED',
  'not-applicable': 'NOT_APPLICABLE',
  superseded: 'SUPERSEDED',
};

export function toInvitation(outcome: IamInvitationOutcome): InvitationOutcome {
  return invitations[outcome.outcome];
}

const providerSessions = {
  terminated: 'TERMINATED',
  'no-identity': 'NO_IDENTITY',
  failed: 'FAILED',
} as const satisfies Record<ProviderSessionsOutcome['outcome'], string>;

export function toProviderSessions(outcome: ProviderSessionsOutcome) {
  return providerSessions[outcome.outcome];
}
