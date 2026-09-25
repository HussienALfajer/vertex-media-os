import type { DatabaseClient } from '@vertex-os/database';
import { iamPersistenceOf } from '@vertex-os/database/iam';
import { SYSTEM_ADMINISTRATOR_ROLE_CODE } from '@vertex-os/iam/persistence';

/** IAM's credential lookup returns only what its sign-in capability needs. */
export function createLocalCredentials(database: DatabaseClient) {
  const client = iamPersistenceOf(database);
  return Object.freeze({
    async findByEmail(email: string) {
      const row = await client.iamApplicationUser.findUnique({
        where: { email },
        select: { id: true, passwordHash: true },
      });
      return row === null
        ? undefined
        : { userId: row.id, passwordHash: row.passwordHash ?? undefined };
    },
  });
}

export async function findSystemAdministratorRoleId(
  database: DatabaseClient,
): Promise<string | undefined> {
  const row = await iamPersistenceOf(database).iamRole.findUnique({
    where: { code: SYSTEM_ADMINISTRATOR_ROLE_CODE },
    select: { id: true },
  });
  return row?.id;
}
