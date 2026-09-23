import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMigratedPostgres, type TestPostgres } from '../test-support/postgres.js';
import { iamPersistenceOf } from './iam.js';
import {
  createDatabaseClient,
  DatabaseUnavailableError,
  describeDatabaseError,
  type DatabaseClient,
} from './index.js';

// Distinctive values: if any of them appears in a description, row data or raw input leaked.
const SENTINEL_EMAIL = 'Sentinel.Person@Example.com';
const SENTINEL_INPUT = 'sentinel-not-a-uuid-7c1e';

const INVITED_USER = {
  displayName: 'Sentinel Display',
  accessState: 'INVITED',
  identitySyncState: 'PENDING',
  invitationDeliveryState: 'NOT_SENT',
} as const;

describe('describeDatabaseError with real Prisma errors from PostgreSQL', () => {
  let postgres: TestPostgres;
  let database: DatabaseClient;

  beforeAll(async () => {
    postgres = await startMigratedPostgres();
    database = createDatabaseClient({ connectionString: postgres.url });
  }, 180_000);

  afterAll(async () => {
    await database?.disconnect();
    await postgres?.stop();
  });

  function expectNoSentinel(description: unknown): void {
    expect(JSON.stringify(description)).not.toMatch(/sentinel|example\.com|Failing row/i);
  }

  it('describes a CHECK violation through the typed API (P2039) without the failing row', async () => {
    const error = await iamPersistenceOf(database)
      .iamApplicationUser.create({ data: { ...INVITED_USER, email: SENTINEL_EMAIL } })
      .catch((failure: unknown) => failure);
    // The raw error does carry the row: this is what must never be logged.
    expect(JSON.stringify(error)).toContain(SENTINEL_EMAIL);
    const description = describeDatabaseError(error);
    expect(description).toEqual({
      errorClass: 'PrismaClientKnownRequestError',
      prismaCode: 'P2039',
      sqlState: '23514',
      driverKind: 'postgres',
      model: 'IamApplicationUser',
    });
    expectNoSentinel(description);
  });

  it('describes a CHECK violation through raw SQL (P2010) without the failing row', async () => {
    const error = await iamPersistenceOf(database).$executeRaw`INSERT INTO iam_application_user
        (email, display_name, access_state, identity_sync_state, invitation_delivery_state)
        VALUES (${SENTINEL_EMAIL}, 'x', 'INVITED', 'PENDING', 'NOT_SENT')`.catch(
      (failure: unknown) => failure,
    );
    expect(JSON.stringify(error)).toContain(SENTINEL_EMAIL);
    const description = describeDatabaseError(error);
    expect(description).toEqual({
      errorClass: 'PrismaClientKnownRequestError',
      prismaCode: 'P2010',
      sqlState: '23514',
      driverKind: 'postgres',
    });
    expectNoSentinel(description);
  });

  it('describes invalid input (P2007) without the input, which Prisma puts in its messages', async () => {
    const error = await iamPersistenceOf(database)
      .iamApplicationUser.findUnique({ where: { id: SENTINEL_INPUT } })
      .catch((failure: unknown) => failure);
    expect(`${String(error)}${JSON.stringify(error)}`).toContain(SENTINEL_INPUT);
    const description = describeDatabaseError(error);
    expect(description).toEqual({
      errorClass: 'PrismaClientKnownRequestError',
      prismaCode: 'P2007',
      sqlState: '22P02',
      driverKind: 'InvalidInputValue',
      model: 'IamApplicationUser',
    });
    expectNoSentinel(description);
  });

  it('describes a unique violation (P2002) with its structured constraint and table', async () => {
    const email = 'sentinel.unique@example.com';
    await iamPersistenceOf(database).iamApplicationUser.create({
      data: { ...INVITED_USER, email },
    });
    const error = await iamPersistenceOf(database)
      .iamApplicationUser.create({ data: { ...INVITED_USER, email } })
      .catch((failure: unknown) => failure);
    const description = describeDatabaseError(error);
    expect(description).toEqual({
      errorClass: 'PrismaClientKnownRequestError',
      prismaCode: 'P2002',
      sqlState: '23505',
      driverKind: 'UniqueConstraintViolation',
      constraint: 'iam_application_user_email_key',
      table: 'iam_application_user',
      model: 'IamApplicationUser',
    });
    expectNoSentinel(description);
  });

  it('describes a validation error without the call arguments it prints', async () => {
    const error = await iamPersistenceOf(database)
      .iamApplicationUser.create({ data: { email: SENTINEL_EMAIL } as never })
      .catch((failure: unknown) => failure);
    expect(String(error)).toContain('iamApplicationUser.create');
    const description = describeDatabaseError(error);
    expect(description).toEqual({ errorClass: 'PrismaClientValidationError' });
    expectNoSentinel(description);
  });

  it('describes an unreachable server by Prisma code and driver category, without host or port', async () => {
    const unreachable = createDatabaseClient({
      connectionString: 'postgresql://sentinel_user:sentinel-password@127.0.0.1:1/sentinel_db',
      connectTimeoutMs: 2_000,
    });
    try {
      const error = await iamPersistenceOf(unreachable)
        .iamApplicationUser.findMany()
        .catch((failure: unknown) => failure);
      const description = describeDatabaseError(error);
      expect(description).toEqual({
        errorClass: 'PrismaClientKnownRequestError',
        prismaCode: 'P1001',
        driverKind: 'DatabaseNotReachable',
        model: 'IamApplicationUser',
      });
      expect(JSON.stringify(description)).not.toMatch(/sentinel|127\.0\.0\.1|password/);
    } finally {
      await unreachable.disconnect();
    }
  });

  it('describes DatabaseUnavailableError by reason and SQLSTATE only', () => {
    expect(
      describeDatabaseError(new DatabaseUnavailableError('AuthenticationFailed', '28P01')),
    ).toEqual({
      errorClass: 'DatabaseUnavailableError',
      reason: 'AuthenticationFailed',
      sqlState: '28P01',
    });
    expect(describeDatabaseError(new DatabaseUnavailableError('Unclassified', undefined))).toEqual({
      errorClass: 'DatabaseUnavailableError',
      reason: 'Unclassified',
    });
  });

  it('returns undefined for anything that is not a database error', () => {
    for (const value of [
      new Error(SENTINEL_EMAIL),
      new TypeError('x'),
      { code: 'P2002', meta: { driverAdapterError: { cause: { originalCode: '23505' } } } },
      'P2002',
      null,
      undefined,
    ]) {
      expect(describeDatabaseError(value)).toBeUndefined();
    }
  });
});
