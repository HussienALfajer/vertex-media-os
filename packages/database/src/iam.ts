/**
 * MOD-IAM's private persistence entry. Only the IAM adapter (`domains/iam-persistence`) may import
 * it (lint-enforced). The client it returns reaches the `iam*` models and raw SQL only.
 */
import {
  prismaClientOf,
  runInTransaction,
  type DatabaseClient,
  type DatabaseTransaction,
  type DomainScopedClient,
} from './database-client.js';

export type IamPersistenceClient = DomainScopedClient<'iam'>;

/** The IAM-scoped client for a pooled client or an open transaction. */
export function iamPersistenceOf(
  handle: DatabaseClient | DatabaseTransaction,
): IamPersistenceClient {
  return prismaClientOf(handle);
}

export { runInTransaction };
export type { TransactionOptions } from './database-client.js';
export type {
  IamApplicationUser,
  IamPermission,
  IamRole,
  IamRolePermission,
} from './generated/prisma/client.js';
export {
  IamUserAccessState,
  IamIdentitySyncState,
  IamInvitationDeliveryState,
  IamDepartmentState,
  IamRoleState,
  IamPermissionState,
  IamPermissionSensitivity,
} from './generated/prisma/enums.js';
