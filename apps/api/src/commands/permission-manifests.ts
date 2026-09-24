import { iamPermissionManifest, type PermissionManifest } from '@vertex-os/iam';

/**
 * Every module's code-defined permission manifest. Reference synchronization converges the
 * database to exactly these, and bootstrap refuses unless it has (IAM-R06 review AB-5), so both
 * commands read this one list.
 */
export const permissionManifests: readonly PermissionManifest[] = Object.freeze([
  iamPermissionManifest,
]);
