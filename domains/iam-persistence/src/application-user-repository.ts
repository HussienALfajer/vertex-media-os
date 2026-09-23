import type { DatabaseClient } from '@vertex-os/database';
import { iamPersistenceOf, type IamApplicationUser } from '@vertex-os/database/iam';
import type {
  ApplicationUser,
  ApplicationUserRepository,
  DisplayName,
  NormalizedEmail,
  UserId,
} from '@vertex-os/iam/persistence';
import {
  accessFromDatabase,
  identitySyncFromDatabase,
  invitationFromDatabase,
} from './enum-mapping.js';

/** Columns of an ApplicationUser; shared with the transaction-bound identity store. */
export const userSelect = {
  id: true,
  email: true,
  displayName: true,
  accessState: true,
  identityIssuer: true,
  identitySubject: true,
  identitySyncState: true,
  invitationDeliveryState: true,
  invitationSentAt: true,
  firstActivatedAt: true,
  lastAccessStateChangedAt: true,
  createdAt: true,
  updatedAt: true,
  version: true,
} as const;

export function mapUser(row: IamApplicationUser): ApplicationUser {
  return {
    id: row.id as UserId,
    email: row.email as NormalizedEmail,
    displayName: row.displayName as DisplayName,
    accessState: accessFromDatabase[row.accessState],
    identity:
      row.identityIssuer === null || row.identitySubject === null
        ? undefined
        : { issuer: row.identityIssuer, subject: row.identitySubject },
    identitySyncState: identitySyncFromDatabase[row.identitySyncState],
    invitationDeliveryState: invitationFromDatabase[row.invitationDeliveryState],
    invitationSentAt: row.invitationSentAt === null ? undefined : new Date(row.invitationSentAt),
    firstActivatedAt: row.firstActivatedAt === null ? undefined : new Date(row.firstActivatedAt),
    lastAccessStateChangedAt: new Date(row.lastAccessStateChangedAt),
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
    version: row.version,
  };
}

/**
 * Committed-user reads on the caller's pool (IAM-R06 D-04). Its public declaration contains only
 * IAM types.
 */
export function createApplicationUserRepository(
  database: DatabaseClient,
): ApplicationUserRepository {
  const client = iamPersistenceOf(database);

  return {
    async findById(id: UserId) {
      const row = await client.iamApplicationUser.findUnique({ where: { id }, select: userSelect });
      return row === null ? undefined : mapUser(row);
    },

    async findByIdentity({ issuer, subject }) {
      const row = await client.iamApplicationUser.findUnique({
        where: {
          identityIssuer_identitySubject: { identityIssuer: issuer, identitySubject: subject },
        },
        select: userSelect,
      });
      return row === null ? undefined : mapUser(row);
    },
  };
}
