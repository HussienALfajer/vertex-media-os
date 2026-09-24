import {
  departmentStates,
  identitySyncStates,
  invitationDeliveryStates,
  permissionSensitivities,
  permissionStates,
  roleStates,
  userAccessStates,
} from '@vertex-os/iam';
import { z } from 'zod';
import { namedSchema } from '../../openapi/schemas.js';

/**
 * The IAM HTTP contracts as Zod schemas (IAM-R07 D-04, D-06, D-17). Request schemas are strict
 * and check shape, types, identifier format and coarse size caps before any capability runs; the
 * use cases apply the exact text rules. Response schemas type the mappers and describe the
 * responses; the OpenAPI document is generated from both.
 */

/** IAM identifiers: lower-case hexadecimal UUIDs, exactly as IAM parses them. */
export const Id = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  .meta({ format: 'uuid' });

// Coarse caps in UTF-16 units, above every exact limit IAM applies in code points.
const Email = z.string().max(1_000);
const DisplayName = z.string().max(1_000);
const Code = z.string().max(200);
const Name = z.string().max(1_000);
const Description = z.string().max(8_000);
/** An administrative reason (spec Section 53); Audit's rule decides its exact form. */
const Reason = z.string().max(2_000);
const ExpectedVersion = z.int().min(1);

// ---------------------------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------------------------

export const CreateUserBody = z.strictObject({
  email: Email,
  displayName: DisplayName,
  memberships: z
    .array(z.strictObject({ departmentId: Id, isPrimary: z.boolean() }))
    .max(100)
    .optional(),
  roleIds: z.array(Id).max(100).optional(),
});

/** Only the display name is mutable (spec Sections 9.1, 25.3); any other field is refused. */
export const UpdateUserBody = z.strictObject({
  expectedVersion: ExpectedVersion,
  displayName: DisplayName,
});

export const ReasonBody = z.strictObject({ reason: Reason.optional() }).optional();

export const ReactivateUserBody = z.strictObject({
  expectedVersion: ExpectedVersion,
  reason: Reason.optional(),
});

export const EmptyBody = z.strictObject({}).optional();

export const AddMembershipBody = z.strictObject({ departmentId: Id, isPrimary: z.boolean() });

export const SetMembershipBody = z.strictObject({ isPrimary: z.boolean() });

export const RemoveMembershipQuery = z.strictObject({
  replacementPrimaryDepartmentId: Id.optional(),
});

export const AssignRoleBody = z.strictObject({ roleId: Id, reason: Reason.optional() });

export const CreateEntityBody = z.strictObject({
  code: Code,
  name: Name,
  description: Description.optional(),
});

export const UpdateEntityBody = z.strictObject({
  expectedVersion: ExpectedVersion,
  name: Name.optional(),
  /** `null` clears the description. */
  description: Description.nullable().optional(),
});

export const VersionBody = z.strictObject({ expectedVersion: ExpectedVersion });

export const DeactivateRoleBody = z.strictObject({
  expectedVersion: ExpectedVersion,
  reason: Reason.optional(),
});

export const ReplacePermissionsBody = z.strictObject({
  expectedVersion: ExpectedVersion,
  permissionCodes: z.array(Code).max(500),
  reason: Reason.optional(),
});

/** Query values arrive as strings; numbers are decimal digits only. */
const Digits = z
  .string()
  .regex(/^[0-9]{1,9}$/)
  .transform(Number);
/** A coarse cap on search text before IAM trims it and applies its 1–100 character rule. */
export const SEARCH_MAX_LENGTH = 400;
const PageQuery = {
  page: Digits.optional(),
  pageSize: Digits.optional(),
  search: z.string().min(1).max(SEARCH_MAX_LENGTH).optional(),
};

export const UserListQuery = z.strictObject({
  ...PageQuery,
  accessState: z.string().max(40).optional(),
  departmentId: Id.optional(),
  roleId: Id.optional(),
});

export const StateListQuery = z.strictObject({
  ...PageQuery,
  state: z.string().max(40).optional(),
});

// ---------------------------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------------------------

const Instant = z.string().meta({ format: 'date-time' });

export const UserResponse = z.object({
  id: Id,
  email: z.string().meta({ format: 'email' }),
  displayName: z.string(),
  accessState: z.enum(userAccessStates),
  identitySyncState: z.enum(identitySyncStates),
  invitationDeliveryState: z.enum(invitationDeliveryStates),
  invitationSentAt: Instant.nullable(),
  firstActivatedAt: Instant.nullable(),
  lastAccessStateChangedAt: Instant,
  createdAt: Instant,
  updatedAt: Instant,
  version: z.int(),
});

const UserDepartment = z.object({
  id: Id,
  code: z.string(),
  name: z.string(),
  state: z.enum(departmentStates),
  isPrimary: z.boolean(),
});

const UserRole = z.object({
  id: Id,
  code: z.string(),
  name: z.string(),
  state: z.enum(roleStates),
  isSystem: z.boolean(),
});

export const UserDetailResponse = UserResponse.extend({
  departments: z.array(UserDepartment),
  roles: z.array(UserRole),
});

/** The directory list's operational fields only (spec Section 42). */
export const UserSummaryResponse = z.object({
  id: Id,
  email: z.string().meta({ format: 'email' }),
  displayName: z.string(),
  accessState: z.enum(userAccessStates),
  identitySyncState: z.enum(identitySyncStates),
  invitationDeliveryState: z.enum(invitationDeliveryStates),
  departments: z.array(UserDepartment),
  roles: z.array(UserRole),
});

function pageOf<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    page: z.int(),
    pageSize: z.int(),
    total: z.int(),
  });
}

export const UserPageResponse = pageOf(UserSummaryResponse);

export const InvitationOutcome = z.enum([
  'SENT',
  'FAILED',
  'NO_ACTION_REQUIRED',
  'NOT_APPLICABLE',
  'SUPERSEDED',
]);

export const CreateUserResponse = z.object({ user: UserResponse });

export const RestrictUserResponse = z.object({
  user: UserResponse,
  sessionsRevoked: z.int(),
});

export const ReactivateUserResponse = z.object({
  user: UserResponse,
  /** What the backend derived: ACTIVE, or INVITED pending first activation (spec Section 10.7). */
  target: z.enum(['ACTIVE', 'INVITED']),
});

export const UserInvitationResponse = z.object({
  user: UserResponse,
  invitation: InvitationOutcome,
});

export const RevokeSessionsResponse = z.object({
  sessionsRevoked: z.int(),
  providerSessions: z.enum(['TERMINATED', 'NO_IDENTITY', 'FAILED']),
});

export const MembershipAddedResponse = z.object({
  departmentId: Id,
  isPrimary: z.boolean(),
  demotedPrimaryDepartmentId: Id.nullable(),
});

export const PrimaryDepartmentResponse = z.object({ primaryDepartmentId: Id.nullable() });

export const RoleAssignedResponse = z.object({ userId: Id, roleId: Id });

export const DepartmentResponse = z.object({
  id: Id,
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  state: z.enum(departmentStates),
  version: z.int(),
});

export const DepartmentPageResponse = pageOf(DepartmentResponse);

export const RoleResponse = z.object({
  id: Id,
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  state: z.enum(roleStates),
  isSystem: z.boolean(),
  version: z.int(),
});

export const RoleDetailResponse = RoleResponse.extend({ permissionCodes: z.array(z.string()) });

export const RolePageResponse = pageOf(RoleResponse);

export const PermissionResponse = z.object({
  code: z.string(),
  owningModule: z.string(),
  name: z.string(),
  description: z.string(),
  state: z.enum(permissionStates),
  sensitivity: z.enum(permissionSensitivities),
});

export const PermissionPageResponse = pageOf(PermissionResponse);

/** The current user (spec Section 25.2; IAM-R07 D-12): no role names, only effective codes. */
export const MeResponse = z.object({
  user: z.object({ id: Id, email: z.string().meta({ format: 'email' }), displayName: z.string() }),
  departments: z.array(
    z.object({ id: Id, code: z.string(), name: z.string(), isPrimary: z.boolean() }),
  ),
  permissionCodes: z.array(z.string()),
});

export type UserResponse = z.output<typeof UserResponse>;
export type UserDetailResponse = z.output<typeof UserDetailResponse>;
export type UserSummaryResponse = z.output<typeof UserSummaryResponse>;
export type DepartmentResponse = z.output<typeof DepartmentResponse>;
export type RoleResponse = z.output<typeof RoleResponse>;
export type RoleDetailResponse = z.output<typeof RoleDetailResponse>;
export type PermissionResponse = z.output<typeof PermissionResponse>;
export type MeResponse = z.output<typeof MeResponse>;
export type InvitationOutcome = z.output<typeof InvitationOutcome>;

/** Named components of the OpenAPI document, one per request body and response. */
export const refs = {
  CreateUserBody: namedSchema('IamCreateUserRequest', CreateUserBody, 'input'),
  UpdateUserBody: namedSchema('IamUpdateUserRequest', UpdateUserBody, 'input'),
  ReasonBody: namedSchema(
    'IamReasonRequest',
    z.strictObject({ reason: Reason.optional() }),
    'input',
  ),
  ReactivateUserBody: namedSchema('IamReactivateUserRequest', ReactivateUserBody, 'input'),
  AddMembershipBody: namedSchema('IamAddMembershipRequest', AddMembershipBody, 'input'),
  SetMembershipBody: namedSchema('IamSetMembershipRequest', SetMembershipBody, 'input'),
  AssignRoleBody: namedSchema('IamAssignRoleRequest', AssignRoleBody, 'input'),
  CreateEntityBody: namedSchema('IamCreateDepartmentOrRoleRequest', CreateEntityBody, 'input'),
  UpdateEntityBody: namedSchema('IamUpdateDepartmentOrRoleRequest', UpdateEntityBody, 'input'),
  VersionBody: namedSchema('IamVersionRequest', VersionBody, 'input'),
  DeactivateRoleBody: namedSchema('IamDeactivateRoleRequest', DeactivateRoleBody, 'input'),
  ReplacePermissionsBody: namedSchema(
    'IamReplaceRolePermissionsRequest',
    ReplacePermissionsBody,
    'input',
  ),
  User: namedSchema('IamUser', UserResponse),
  UserDetail: namedSchema('IamUserDetail', UserDetailResponse),
  UserPage: namedSchema('IamUserPage', UserPageResponse),
  CreateUser: namedSchema('IamCreateUserResponse', CreateUserResponse),
  RestrictUser: namedSchema('IamRestrictUserResponse', RestrictUserResponse),
  ReactivateUser: namedSchema('IamReactivateUserResponse', ReactivateUserResponse),
  UserInvitation: namedSchema('IamUserInvitationResponse', UserInvitationResponse),
  RevokeSessions: namedSchema('IamRevokeSessionsResponse', RevokeSessionsResponse),
  MembershipAdded: namedSchema('IamMembershipAddedResponse', MembershipAddedResponse),
  PrimaryDepartment: namedSchema('IamPrimaryDepartmentResponse', PrimaryDepartmentResponse),
  RoleAssigned: namedSchema('IamRoleAssignedResponse', RoleAssignedResponse),
  Department: namedSchema('IamDepartment', DepartmentResponse),
  DepartmentPage: namedSchema('IamDepartmentPage', DepartmentPageResponse),
  Role: namedSchema('IamRole', RoleResponse),
  RoleDetail: namedSchema('IamRoleDetail', RoleDetailResponse),
  RolePage: namedSchema('IamRolePage', RolePageResponse),
  PermissionPage: namedSchema('IamPermissionPage', PermissionPageResponse),
  Me: namedSchema('IamCurrentUser', MeResponse),
} as const;
