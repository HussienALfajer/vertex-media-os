/**
 * Compile-time proof of the per-domain scoping (IAM-02 D-03). `typecheck` compiles this file through
 * tsconfig.spec.json; every `@ts-expect-error` below fails the build if the line it marks ever
 * compiles. The function is never called: the assertions are the types, not runtime behavior.
 */
import { auditPersistenceOf } from './audit.js';
import { authPersistenceOf } from './auth.js';
import { iamPersistenceOf } from './iam.js';
import type { DatabaseClient, DatabaseTransaction } from './index.js';

export function scopedClientTypeAssertions(
  handle: DatabaseClient | DatabaseTransaction,
): unknown[] {
  const iam = iamPersistenceOf(handle);
  const audit = auditPersistenceOf(handle);
  const auth = authPersistenceOf(handle);
  return [
    // Each domain reaches its own models and raw SQL.
    iam.iamRole,
    iam.iamPermission,
    iam.$queryRaw,
    iam.$executeRaw,
    audit.auditRecord,
    audit.$queryRaw,
    audit.$executeRaw,
    auth.authSession,
    auth.authLoginAttempt,
    auth.$queryRaw,
    // @ts-expect-error -- the IAM scope has no Audit model (IAM must never write Audit tables).
    iam.auditRecord,
    // @ts-expect-error -- the Audit scope has no IAM model.
    audit.iamRole,
    // @ts-expect-error -- the Audit scope has no IAM model.
    audit.iamPermission,
    // @ts-expect-error -- the platform authentication scope has no IAM model.
    auth.iamApplicationUser,
    // @ts-expect-error -- the platform authentication scope has no Audit model.
    auth.auditRecord,
    // @ts-expect-error -- the IAM scope has no authentication model.
    iam.authSession,
    // @ts-expect-error -- the Audit scope has no authentication model.
    audit.authSession,
    // @ts-expect-error -- adapters open transactions only through runInTransaction.
    iam.$transaction,
    // @ts-expect-error -- adapters open transactions only through runInTransaction.
    audit.$transaction,
    // @ts-expect-error -- the composition root owns the pool.
    iam.$disconnect,
    // @ts-expect-error -- the composition root owns the pool.
    iam.$connect,
    // @ts-expect-error -- client extensions are not part of a domain scope.
    iam.$extends,
  ];
}
