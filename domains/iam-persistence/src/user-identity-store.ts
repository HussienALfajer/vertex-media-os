import type { IamPersistenceClient } from '@vertex-os/database/iam';
import type {
  UserId,
  UserIdentityStore,
  UserIdentityWriteResult,
} from '@vertex-os/iam/persistence';
import { mapUser, userSelect } from './application-user-repository.js';
import { identitySyncToDatabase, invitationToDatabase } from './enum-mapping.js';

/**
 * The version-checked identity writes of IAM-R02 D-09, bound to the caller's transaction. Each
 * write is one conditional `UPDATE … WHERE id AND version`, so a competing writer either waits for
 * the row lock and then misses the version, or commits after and misses it itself.
 */
export function createUserIdentityStore(client: IamPersistenceClient): UserIdentityStore {
  async function write(
    id: UserId,
    expectedVersion: number,
    where: { readonly identitySubject?: null },
    data: Record<string, unknown>,
  ): Promise<UserIdentityWriteResult> {
    const rows = await client.iamApplicationUser.updateManyAndReturn({
      where: { id, version: expectedVersion, ...where },
      data: { ...data, version: { increment: 1 }, updatedAt: new Date() },
      select: userSelect,
    });
    const row = rows[0];
    if (row) return { outcome: 'updated', user: mapUser(row) };
    const existing = await client.iamApplicationUser.findUnique({
      where: { id },
      select: { id: true },
    });
    return existing === null ? { outcome: 'not-found' } : { outcome: 'version-conflict' };
  }

  return {
    async bindIdentity({ id, expectedVersion, issuer, subject }) {
      // Checked first: a unique violation would abort the caller's transaction and its Audit
      // append. A concurrent binding of the same identity still fails on the unique key.
      const holder = await client.iamApplicationUser.findUnique({
        where: {
          identityIssuer_identitySubject: { identityIssuer: issuer, identitySubject: subject },
        },
        select: { id: true },
      });
      if (holder !== null && holder.id !== id) return { outcome: 'identity-taken' };
      return write(
        id,
        expectedVersion,
        { identitySubject: null },
        { identityIssuer: issuer, identitySubject: subject },
      );
    },

    recordIdentitySync({ id, expectedVersion, state }) {
      return write(id, expectedVersion, {}, { identitySyncState: identitySyncToDatabase[state] });
    },

    recordInvitationDelivery({ id, expectedVersion, state }) {
      return write(
        id,
        expectedVersion,
        {},
        state === 'SENT'
          ? { invitationDeliveryState: invitationToDatabase[state], invitationSentAt: new Date() }
          : { invitationDeliveryState: invitationToDatabase[state] },
      );
    },
  };
}
