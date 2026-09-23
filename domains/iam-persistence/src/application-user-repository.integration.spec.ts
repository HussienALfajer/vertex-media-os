import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type {
  DepartmentId,
  DisplayName,
  NewApplicationUser,
  NormalizedEmail,
  RoleId,
  UserId,
} from '@vertex-os/iam/persistence';
import { createApplicationUserRepository } from './index.js';
import { startMigratedPostgres, type MigratedPostgres } from '../test-support/postgres.js';

const missingId = '00000000-0000-4000-8000-000000000099';

describe('ApplicationUserRepository against real PostgreSQL', () => {
  let postgres: MigratedPostgres;

  beforeAll(async () => {
    postgres = await startMigratedPostgres();
  }, 180_000);
  afterAll(async () => {
    await postgres?.stop();
  });
  beforeEach(async () => {
    await postgres.client.$executeRawUnsafe(
      'TRUNCATE iam_application_user, iam_department, iam_role, iam_permission CASCADE',
    );
  });

  function draft(
    email: string,
    options: {
      memberships?: NewApplicationUser['memberships'];
      roleIds?: NewApplicationUser['roleIds'];
    } = {},
  ): NewApplicationUser {
    return {
      email: email as NormalizedEmail,
      displayName: 'Synthetic User' as DisplayName,
      accessState: 'INVITED',
      identitySyncState: 'PENDING',
      invitationDeliveryState: 'NOT_SENT',
      memberships: options.memberships ?? [],
      roleIds: options.roleIds ?? [],
    };
  }

  async function seedDepartment(): Promise<DepartmentId> {
    const row = await postgres.client.iamDepartment.create({
      data: { code: 'test-dept', name: 'Test Department', state: 'ACTIVE' },
      select: { id: true },
    });
    return row.id as DepartmentId;
  }

  async function seedRole(): Promise<RoleId> {
    const row = await postgres.client.iamRole.create({
      data: { code: 'test-role', name: 'Test Role', state: 'ACTIVE', isSystem: false },
      select: { id: true },
    });
    return row.id as RoleId;
  }

  async function counts(): Promise<{ users: number; memberships: number; assignments: number }> {
    const [row] = await postgres.client.$queryRaw<
      Array<{ users: number; memberships: number; assignments: number }>
    >`SELECT
      (SELECT count(*)::int FROM iam_application_user) AS users,
      (SELECT count(*)::int FROM iam_department_membership) AS memberships,
      (SELECT count(*)::int FROM iam_user_role_assignment) AS assignments`;
    if (!row) throw new Error('Expected count row');
    return row;
  }

  it('atomically creates a user with every user field and both relation kinds', async () => {
    const departmentId = await seedDepartment();
    const roleId = await seedRole();
    const repository = createApplicationUserRepository(postgres.database);
    const result = await repository.create(
      draft('roundtrip@example.invalid', {
        memberships: [{ departmentId, isPrimary: true }],
        roleIds: [roleId],
      }),
    );
    expect(result.outcome).toBe('created');
    if (result.outcome !== 'created') throw new Error('Expected created');
    expect(result.user).toMatchObject({
      email: 'roundtrip@example.invalid',
      displayName: 'Synthetic User',
      accessState: 'INVITED',
      identity: undefined,
      identitySyncState: 'PENDING',
      invitationDeliveryState: 'NOT_SENT',
      invitationSentAt: undefined,
      firstActivatedAt: undefined,
      version: 1,
    });
    expect(result.user.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(result.user.createdAt).toEqual(result.user.updatedAt);
    expect(result.user.createdAt).toEqual(result.user.lastAccessStateChangedAt);
    expect(await repository.findById(result.user.id)).toEqual(result.user);
    expect(
      await postgres.client.iamDepartmentMembership.findMany({ where: { userId: result.user.id } }),
    ).toMatchObject([{ departmentId, isPrimary: true }]);
    expect(
      await postgres.client.iamUserRoleAssignment.findMany({ where: { userId: result.user.id } }),
    ).toMatchObject([{ roleId }]);
  });

  it('rolls back the user and joins for an unknown department', async () => {
    const roleId = await seedRole();
    const repository = createApplicationUserRepository(postgres.database);
    expect(
      await repository.create(
        draft('unknown-dept@example.invalid', {
          memberships: [{ departmentId: missingId as DepartmentId, isPrimary: true }],
          roleIds: [roleId],
        }),
      ),
    ).toEqual({ outcome: 'unknown-reference' });
    expect(await counts()).toEqual({ users: 0, memberships: 0, assignments: 0 });
  });

  it('rolls back the user and joins for an unknown role', async () => {
    const departmentId = await seedDepartment();
    const repository = createApplicationUserRepository(postgres.database);
    expect(
      await repository.create(
        draft('unknown-role@example.invalid', {
          memberships: [{ departmentId, isPrimary: true }],
          roleIds: [missingId as RoleId],
        }),
      ),
    ).toEqual({ outcome: 'unknown-reference' });
    expect(await counts()).toEqual({ users: 0, memberships: 0, assignments: 0 });
  });

  it('rethrows a programming-error membership violation without partial writes', async () => {
    const firstDepartment = await seedDepartment();
    const otherDepartment = await postgres.client.iamDepartment.create({
      data: { code: 'other-dept', name: 'Other Department', state: 'ACTIVE' },
      select: { id: true },
    });
    const repository = createApplicationUserRepository(postgres.database);
    await expect(
      repository.create(
        draft('invalid-membership@example.invalid', {
          memberships: [
            { departmentId: firstDepartment, isPrimary: true },
            { departmentId: otherDepartment.id as DepartmentId, isPrimary: true },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(Error);
    expect(await counts()).toEqual({ users: 0, memberships: 0, assignments: 0 });
  });

  it('maps email conflict without changing the existing user or writing joins', async () => {
    const departmentId = await seedDepartment();
    const roleId = await seedRole();
    const repository = createApplicationUserRepository(postgres.database);
    const first = await repository.create(draft('duplicate@example.invalid'));
    expect(first.outcome).toBe('created');
    const result = await repository.create(
      draft('duplicate@example.invalid', {
        memberships: [{ departmentId, isPrimary: true }],
        roleIds: [roleId],
      }),
    );
    expect(result).toEqual({ outcome: 'email-conflict' });
    expect(await counts()).toEqual({ users: 1, memberships: 0, assignments: 0 });
    if (first.outcome === 'created')
      expect(await repository.findById(first.user.id)).toEqual(first.user);
    expect(JSON.stringify(result)).not.toMatch(/duplicate@example\.invalid|driver|23505/i);
  });

  it('allows exactly one of several concurrent creates for one email', async () => {
    const repository = createApplicationUserRepository(postgres.database);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => repository.create(draft('race@example.invalid'))),
    );
    expect(results.filter((result) => result.outcome === 'created')).toHaveLength(1);
    expect(results.filter((result) => result.outcome === 'email-conflict')).toHaveLength(4);
    expect((await counts()).users).toBe(1);
  });

  it('returns undefined for an unknown ID', async () => {
    const repository = createApplicationUserRepository(postgres.database);
    expect(await repository.findById(missingId as UserId)).toBeUndefined();
  });

  it('updates only display name, version and updated timestamp', async () => {
    const repository = createApplicationUserRepository(postgres.database);
    const created = await repository.create(draft('update@example.invalid'));
    if (created.outcome !== 'created') throw new Error('Expected created');
    const before = await postgres.client.iamApplicationUser.findUniqueOrThrow({
      where: { id: created.user.id },
    });
    const updated = await repository.updateDisplayName({
      id: created.user.id,
      expectedVersion: 1,
      displayName: 'Changed Name' as DisplayName,
    });
    expect(updated.outcome).toBe('updated');
    if (updated.outcome !== 'updated') throw new Error('Expected updated');
    expect(updated.user.displayName).toBe('Changed Name');
    expect(updated.user.version).toBe(2);
    expect(updated.user.updatedAt.getTime()).toBeGreaterThan(created.user.updatedAt.getTime());
    const after = await postgres.client.iamApplicationUser.findUniqueOrThrow({
      where: { id: created.user.id },
    });
    const {
      displayName: _beforeName,
      version: _beforeVersion,
      updatedAt: _beforeUpdated,
      ...immutableBefore
    } = before;
    const {
      displayName: _afterName,
      version: _afterVersion,
      updatedAt: _afterUpdated,
      ...immutableAfter
    } = after;
    expect(immutableAfter).toEqual(immutableBefore);
    expect(updated.user.updatedAt).toEqual(after.updatedAt);
  });

  it('reports stale version without changing the row', async () => {
    const repository = createApplicationUserRepository(postgres.database);
    const created = await repository.create(draft('stale@example.invalid'));
    if (created.outcome !== 'created') throw new Error('Expected created');
    expect(
      await repository.updateDisplayName({
        id: created.user.id,
        expectedVersion: 0,
        displayName: 'Wrong' as DisplayName,
      }),
    ).toEqual({ outcome: 'version-conflict' });
    expect(await repository.findById(created.user.id)).toEqual(created.user);
  });

  it('reports not-found for an unknown ID', async () => {
    const repository = createApplicationUserRepository(postgres.database);
    expect(
      await repository.updateDisplayName({
        id: missingId as UserId,
        expectedVersion: 1,
        displayName: 'Missing' as DisplayName,
      }),
    ).toEqual({ outcome: 'not-found' });
  });

  it('allows exactly one of several concurrent updates for one version', async () => {
    const repository = createApplicationUserRepository(postgres.database);
    const created = await repository.create(draft('update-race@example.invalid'));
    if (created.outcome !== 'created') throw new Error('Expected created');
    const changes = ['Alpha', 'Bravo', 'Charlie', 'Delta'].map((displayName) =>
      repository.updateDisplayName({
        id: created.user.id,
        expectedVersion: 1,
        displayName: displayName as DisplayName,
      }),
    );
    const results = await Promise.all(changes);
    expect(results.filter((result) => result.outcome === 'updated')).toHaveLength(1);
    expect(results.filter((result) => result.outcome === 'version-conflict')).toHaveLength(3);
    expect((await repository.findById(created.user.id))?.version).toBe(2);
  });

  it('keeps typed failures free of email and driver text and leaves the pool open', async () => {
    const repository = createApplicationUserRepository(postgres.database);
    const first = await repository.create(draft('clean@example.invalid'));
    expect(first.outcome).toBe('created');
    const failure = await repository.create(draft('clean@example.invalid'));
    expect(JSON.stringify(failure)).not.toMatch(/clean@example\.invalid|driver|constraint|23505/i);
    await expect(postgres.database.ping()).resolves.toBeUndefined();
  });
});
