import type { RoleCode } from './codes.js';
import type { PermissionSensitivity, PermissionState } from './states.js';
import type { Description, EntityName } from './text.js';

/**
 * One permission as its owning module declares it in code (spec Sections 9.5 and 18). Values are
 * validated before synchronization; the manifest is reviewed code, never administrator input.
 */
export interface PermissionDefinition {
  readonly code: string;
  readonly name: string;
  readonly description: string;
  readonly state: PermissionState;
  readonly sensitivity: PermissionSensitivity;
}

/**
 * The permissions one module owns. Manifests are append-only: a capability that is removed stays
 * declared with state `RETIRED`, so its code can never be reused for another meaning.
 */
export interface PermissionManifest {
  readonly module: string;
  readonly permissions: readonly PermissionDefinition[];
}

/**
 * Sensitivity (IAM-02 I-5): `STANDARD` reads non-confidential organizational data; `SENSITIVE`
 * reads personal or security-relevant data, or changes data without altering access or
 * privileges; `PRIVILEGED` grants, removes or alters access, privileges or sessions.
 */
export const iamPermissionManifest: PermissionManifest = Object.freeze({
  module: 'iam',
  permissions: freezeAll([
    {
      code: 'iam.users.read',
      name: 'Read users',
      description: 'View the IAM user directory and user details.',
      state: 'ACTIVE',
      sensitivity: 'SENSITIVE',
    },
    {
      code: 'iam.users.create',
      name: 'Create users',
      description: 'Create and provision invited users and resend their invitations.',
      state: 'ACTIVE',
      sensitivity: 'PRIVILEGED',
    },
    {
      code: 'iam.users.update',
      name: 'Update users',
      description: "Update a user's display name, the only mutable profile field in V1.",
      state: 'ACTIVE',
      sensitivity: 'SENSITIVE',
    },
    {
      code: 'iam.users.manage-access',
      name: 'Manage user access',
      description:
        'Suspend, disable, reactivate or terminate user access, and retry identity synchronization.',
      state: 'ACTIVE',
      sensitivity: 'PRIVILEGED',
    },
    {
      code: 'iam.users.manage-roles',
      name: 'Manage user roles',
      description: 'Grant and remove user roles.',
      state: 'ACTIVE',
      sensitivity: 'PRIVILEGED',
    },
    {
      code: 'iam.users.manage-departments',
      name: 'Manage user departments',
      description: 'Manage user department memberships.',
      state: 'ACTIVE',
      sensitivity: 'SENSITIVE',
    },
    {
      code: 'iam.roles.read',
      name: 'Read roles',
      description: 'View roles and their permission mappings.',
      state: 'ACTIVE',
      sensitivity: 'SENSITIVE',
    },
    {
      code: 'iam.roles.manage',
      name: 'Manage roles',
      description: 'Create, update and deactivate custom roles and edit their permission mappings.',
      state: 'ACTIVE',
      sensitivity: 'PRIVILEGED',
    },
    {
      code: 'iam.permissions.read',
      name: 'Read permissions',
      description: 'View the permission catalog.',
      state: 'ACTIVE',
      sensitivity: 'STANDARD',
    },
    {
      code: 'iam.departments.read',
      name: 'Read departments',
      description: 'View departments.',
      state: 'ACTIVE',
      sensitivity: 'STANDARD',
    },
    {
      code: 'iam.departments.manage',
      name: 'Manage departments',
      description: 'Create, update, activate and deactivate departments.',
      state: 'ACTIVE',
      sensitivity: 'SENSITIVE',
    },
    {
      code: 'iam.sessions.revoke',
      name: 'Revoke sessions',
      description: 'Revoke application sessions for another user.',
      state: 'ACTIVE',
      sensitivity: 'PRIVILEGED',
    },
  ]),
});

function freezeAll(definitions: PermissionDefinition[]): readonly PermissionDefinition[] {
  return Object.freeze(definitions.map((definition) => Object.freeze({ ...definition })));
}

export interface SystemRoleDefinition {
  readonly code: RoleCode;
  readonly name: EntityName;
  readonly description: Description;
}

/** The one protected system role (spec Section 20); it always holds exactly the ACTIVE permissions. */
export const SYSTEM_ADMINISTRATOR_ROLE_CODE = 'system-administrator' as RoleCode;

export const systemAdministratorRole: SystemRoleDefinition = Object.freeze({
  code: SYSTEM_ADMINISTRATOR_ROLE_CODE,
  name: 'System Administrator' as EntityName,
  description: 'Protected system role that holds every active permission.' as Description,
});
