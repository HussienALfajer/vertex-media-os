import { afterAll, beforeAll, expect, it } from 'vitest';
import { startMigratedPostgres, type MigratedPostgres } from '../test-support/postgres.js';

let postgres: MigratedPostgres;
beforeAll(async () => {
  postgres = await startMigratedPostgres();
}, 180_000);
afterAll(async () => {
  await postgres?.stop();
});

it('retains named unique and foreign-key violations in driver-adapter metadata', async () => {
  const user = await postgres.client.iamApplicationUser.create({
    data: {
      email: 'shape@example.invalid',
      displayName: 'Shape',
      accessState: 'INVITED',
      identitySyncState: 'PENDING',
      invitationDeliveryState: 'NOT_SENT',
    },
  });
  const unique = await postgres.client.iamApplicationUser
    .create({
      data: {
        email: 'shape@example.invalid',
        displayName: 'Shape',
        accessState: 'INVITED',
        identitySyncState: 'PENDING',
        invitationDeliveryState: 'NOT_SENT',
      },
    })
    .catch((error: unknown) => error);
  const foreign = await postgres.client
    .$executeRaw`INSERT INTO iam_department_membership (user_id, department_id, is_primary) VALUES (${user.id}::uuid, '00000000-0000-4000-8000-000000000099'::uuid, false)`.catch(
    (error: unknown) => error,
  );
  expect(unique).toBeInstanceOf(Error);
  expect(foreign).toBeInstanceOf(Error);
  expect(unique).toMatchObject({
    code: 'P2002',
    meta: {
      driverAdapterError: {
        cause: {
          kind: 'UniqueConstraintViolation',
          originalCode: '23505',
          constraint: { index: 'iam_application_user_email_key' },
        },
      },
    },
  });
  expect(foreign).toMatchObject({
    code: 'P2010',
    meta: {
      driverAdapterError: {
        cause: {
          kind: 'ForeignKeyConstraintViolation',
          originalCode: '23503',
          constraint: { index: 'iam_department_membership_department_id_fkey' },
        },
      },
    },
  });
});
