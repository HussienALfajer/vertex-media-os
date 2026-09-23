import type { IamPersistenceClient } from '@vertex-os/database/iam';
import type { UserId } from '@vertex-os/iam/persistence';

/**
 * Seeds an INVITED user with the initial states of spec Section 11 directly in the table. Tests
 * use it to arrange state; production creates users only through IAM's creation use case, with
 * Audit evidence (IAM-R06 D-04).
 */
export async function seedInvitedUser(
  client: IamPersistenceClient,
  email: string,
): Promise<{ readonly id: UserId; readonly version: number }> {
  const row = await client.iamApplicationUser.create({
    data: {
      email,
      displayName: 'Synthetic User',
      accessState: 'INVITED',
      identitySyncState: 'PENDING',
      invitationDeliveryState: 'NOT_SENT',
    },
    select: { id: true, version: true },
  });
  return { id: row.id as UserId, version: row.version };
}
