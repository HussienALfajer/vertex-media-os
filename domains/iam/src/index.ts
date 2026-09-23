/**
 * Public IAM package entry point (spec Section 44). It exposes only what composition roots need:
 * the reference-data synchronization command and the IAM permission manifest. Ports, stores and
 * internal types stay behind the private `@vertex-os/iam/persistence` entry.
 */
export {
  synchronizeIamReferenceData,
  type ReferenceSyncResult,
} from './application/synchronize-reference-data.js';
export {
  iamPermissionManifest,
  type PermissionDefinition,
  type PermissionManifest,
} from './domain/permission-catalog.js';
export type { PermissionCode } from './domain/codes.js';
export type { ReferenceSyncRefusalReason } from './domain/reference-sync-plan.js';
