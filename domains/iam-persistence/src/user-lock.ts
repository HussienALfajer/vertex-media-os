import type { IamPersistenceClient } from '@vertex-os/database/iam';
import type { UserAccessState, UserId } from '@vertex-os/iam/persistence';
import { accessFromDatabase, knownLabel } from './enum-mapping.js';

/**
 * Locks one user row `FOR UPDATE` until the transaction ends (IAM-R05 D-07) and returns its
 * committed access state. It orders membership and assignment changes of one user against each
 * other and against a concurrent first activation, which updates the same row.
 */
export async function lockUserRow(
  client: IamPersistenceClient,
  id: UserId,
): Promise<{ readonly accessState: UserAccessState } | undefined> {
  const rows = await client.$queryRaw<{ accessState: string }[]>`
    SELECT access_state::text AS "accessState"
    FROM iam_application_user
    WHERE id = ${id}::uuid
    FOR UPDATE`;
  const row = rows[0];
  return row === undefined
    ? undefined
    : { accessState: knownLabel<UserAccessState>(accessFromDatabase, row.accessState) };
}
