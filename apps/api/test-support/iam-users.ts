import type { UserId } from '@vertex-os/iam';
import type { MigratedPostgres } from './postgres.js';

/**
 * Seeds an INVITED user with the initial states of spec Section 11 directly in the table and
 * returns its ID. Tests use it to arrange state; production creates users only through IAM's
 * creation use case, with Audit evidence (IAM-R06 D-04). `email` is a test-controlled literal.
 */
export async function seedInvitedUser(
  postgres: Pick<MigratedPostgres, 'sql'>,
  email: string,
): Promise<UserId> {
  if (!/^[a-z0-9.+-]+@[a-z0-9.-]+$/.test(email)) throw new Error('seed email must be plain');
  // psql prints the returned value, then the command tag.
  const output = await postgres.sql(
    `INSERT INTO iam_application_user
       (email, display_name, access_state, identity_sync_state, invitation_delivery_state)
     VALUES ('${email}', 'Synthetic User', 'INVITED', 'PENDING', 'NOT_SENT') RETURNING id`,
  );
  const id = output.split('\n')[0] ?? '';
  if (id === '') throw new Error('seed user');
  return id as UserId;
}
