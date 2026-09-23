/**
 * The platform authentication area's private persistence entry (IAM-R03 D-01). Only the API's
 * authentication area (`apps/api/src/auth`) may import it (lint-enforced). The client it returns
 * reaches the `auth*` models and raw SQL only.
 */
import {
  prismaClientOf,
  runInTransaction,
  type DatabaseClient,
  type DatabaseTransaction,
  type DomainScopedClient,
} from './database-client.js';

export type AuthPersistenceClient = DomainScopedClient<'auth'>;

/** The authentication-scoped client for a pooled client or an open transaction. */
export function authPersistenceOf(
  handle: DatabaseClient | DatabaseTransaction,
): AuthPersistenceClient {
  return prismaClientOf(handle);
}

export { runInTransaction };
export type { TransactionOptions } from './database-client.js';
export type { AuthLoginAttempt, AuthSession } from './generated/prisma/client.js';
export { AuthSessionRevocationReason } from './generated/prisma/enums.js';
