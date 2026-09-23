export type { ApplicationUser, NewApplicationUser } from './domain/application-user.js';
export type { DepartmentId, RoleId, UserId } from './domain/identifiers.js';
export type { NormalizedEmail } from './domain/email.js';
export type { Description, DisplayName, EntityName } from './domain/text.js';
export type { ModuleCode, PermissionCode, RoleCode } from './domain/codes.js';
export type {
  UserAccessState,
  IdentitySyncState,
  InvitationDeliveryState,
  PermissionSensitivity,
  PermissionState,
  RoleState,
} from './domain/states.js';
export type {
  ApplicationUserRepository,
  CreateApplicationUserResult,
  UpdateDisplayNameResult,
} from './application/ports/application-user-repository.js';
export {
  SYSTEM_ADMINISTRATOR_ROLE_CODE,
  type SystemRoleDefinition,
} from './domain/permission-catalog.js';
export type {
  DeclaredPermission,
  PermissionFieldValues,
  PersistedPermission,
  PersistedSystemRole,
  ReferenceSnapshot,
  RoleFieldValues,
} from './domain/reference-sync-plan.js';
export type { ReferenceDataStore } from './application/ports/reference-data-store.js';
export type {
  IamTransactionRunner,
  IamTransactionScope,
} from './application/ports/iam-transaction.js';
export type {
  UserIdentityStore,
  UserIdentityWriteResult,
} from './application/ports/user-identity-store.js';
