import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserId } from '@vertex-os/iam/persistence';
import { createAuthorizationReader } from './index.js';
import { startMigratedPostgres, type MigratedPostgres } from '../test-support/postgres.js';
import { seedInvitedUser } from '../test-support/users.js';

const DEPARTMENT = `INSERT INTO iam_department (code, name, state)
  VALUES ($1, $2, $3::iam_department_state) RETURNING id`;
const ROLE = `INSERT INTO iam_role (code, name, state, is_system)
  VALUES ($1, $2, $3::iam_role_state, false) RETURNING id`;
const PERMISSION = `INSERT INTO iam_permission (code, owning_module, name, description, state, sensitivity)
  VALUES ($1, 'iam', $1, $1, $2::iam_permission_state, 'STANDARD')`;
const MISSING_ID = '00000000-0000-4000-8000-000000000099' as UserId;

describe('AuthorizationReader against real PostgreSQL', () => {
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

  const reader = () => createAuthorizationReader(postgres.database);

  async function user(email: string): Promise<UserId> {
    return (await seedInvitedUser(postgres.client, email)).id;
  }

  async function insertReturningId(statement: string, ...values: unknown[]): Promise<string> {
    const rows = await postgres.client.$queryRawUnsafe<{ id: string }[]>(statement, ...values);
    const id = rows[0]?.id;
    if (id === undefined) throw new Error('seed row');
    return id;
  }

  async function sql(statement: string, ...values: unknown[]): Promise<void> {
    await postgres.client.$executeRawUnsafe(statement, ...values);
  }

  it('returns nothing for an unknown user', async () => {
    await expect(reader().readAuthorizationFacts(MISSING_ID)).resolves.toBeUndefined();
  });

  it('returns empty lists for a user without memberships or roles', async () => {
    const id = await user('empty@example.invalid');
    await expect(reader().readAuthorizationFacts(id)).resolves.toEqual({
      accessState: 'INVITED',
      memberships: [],
      grants: [],
    });
  });

  it('returns every membership and grant with its states, and nothing of other users', async () => {
    const id = await user('facts@example.invalid');
    const other = await user('other@example.invalid');
    await sql(`UPDATE iam_application_user SET access_state = 'SUSPENDED' WHERE id = $1::uuid`, id);

    const sales = await insertReturningId(DEPARTMENT, 'sales', 'Sales', 'ACTIVE');
    const archive = await insertReturningId(DEPARTMENT, 'archive', 'Archive', 'INACTIVE');
    const studio = await insertReturningId(DEPARTMENT, 'studio', 'Studio', 'ACTIVE');
    await sql(
      `INSERT INTO iam_department_membership (user_id, department_id, is_primary)
       VALUES ($1::uuid, $2::uuid, false), ($1::uuid, $3::uuid, true), ($4::uuid, $5::uuid, true)`,
      id,
      sales,
      archive,
      other,
      studio,
    );

    for (const [code, state] of [
      ['iam.users.read', 'ACTIVE'],
      ['iam.roles.read', 'DEPRECATED'],
      ['iam.roles.manage', 'RETIRED'],
      ['iam.sessions.revoke', 'ACTIVE'],
    ] as const) {
      await sql(PERMISSION, code, state);
    }
    const editor = await insertReturningId(ROLE, 'editor', 'Editor', 'ACTIVE');
    const dormant = await insertReturningId(ROLE, 'dormant', 'Dormant', 'INACTIVE');
    const unassigned = await insertReturningId(ROLE, 'unassigned', 'Unassigned', 'ACTIVE');
    await sql(
      `INSERT INTO iam_role_permission (role_id, permission_code) VALUES
         ($1::uuid, 'iam.users.read'), ($1::uuid, 'iam.roles.read'), ($1::uuid, 'iam.roles.manage'),
         ($2::uuid, 'iam.users.read'), ($3::uuid, 'iam.sessions.revoke')`,
      editor,
      dormant,
      unassigned,
    );
    await sql(
      `INSERT INTO iam_user_role_assignment (user_id, role_id) VALUES
         ($1::uuid, $2::uuid), ($1::uuid, $3::uuid), ($4::uuid, $5::uuid)`,
      id,
      editor,
      dormant,
      other,
      unassigned,
    );

    const facts = await reader().readAuthorizationFacts(id);
    const byDepartment = (a: { departmentId: string }, b: { departmentId: string }) =>
      a.departmentId.localeCompare(b.departmentId);
    const byGrant = (
      a: { roleState: string; permissionCode: string },
      b: { roleState: string; permissionCode: string },
    ) => `${a.roleState}${a.permissionCode}`.localeCompare(`${b.roleState}${b.permissionCode}`);

    expect(facts?.accessState).toBe('SUSPENDED');
    expect([...(facts?.memberships ?? [])].sort(byDepartment)).toEqual(
      [
        { departmentId: sales, isPrimary: false, departmentState: 'ACTIVE' },
        { departmentId: archive, isPrimary: true, departmentState: 'INACTIVE' },
      ].sort(byDepartment),
    );
    expect([...(facts?.grants ?? [])].sort(byGrant)).toEqual(
      [
        { roleState: 'ACTIVE', permissionCode: 'iam.users.read', permissionState: 'ACTIVE' },
        { roleState: 'ACTIVE', permissionCode: 'iam.roles.read', permissionState: 'DEPRECATED' },
        { roleState: 'ACTIVE', permissionCode: 'iam.roles.manage', permissionState: 'RETIRED' },
        { roleState: 'INACTIVE', permissionCode: 'iam.users.read', permissionState: 'ACTIVE' },
      ].sort(byGrant),
    );
  });

  it('reads everything in one statement, so the facts are one snapshot (D-07)', async () => {
    const id = await user('snapshot@example.invalid');
    const queries = vi.spyOn(postgres.client, '$queryRaw');
    const executions = vi.spyOn(postgres.client, '$executeRaw');
    try {
      await reader().readAuthorizationFacts(id);
      expect(queries).toHaveBeenCalledTimes(1);
      expect(executions).not.toHaveBeenCalled();
    } finally {
      queries.mockRestore();
      executions.mockRestore();
    }
  });

  it('reads committed state on every call', async () => {
    const id = await user('fresh@example.invalid');
    await sql(PERMISSION, 'iam.users.read', 'ACTIVE');
    const role = await insertReturningId(ROLE, 'viewer', 'Viewer', 'ACTIVE');
    await sql(
      `INSERT INTO iam_role_permission (role_id, permission_code) VALUES ($1::uuid, 'iam.users.read')`,
      role,
    );
    await sql(
      `INSERT INTO iam_user_role_assignment (user_id, role_id) VALUES ($1::uuid, $2::uuid)`,
      id,
      role,
    );
    const source = reader();
    expect((await source.readAuthorizationFacts(id))?.grants).toHaveLength(1);

    await sql(`UPDATE iam_permission SET state = 'RETIRED' WHERE code = 'iam.users.read'`);
    expect((await source.readAuthorizationFacts(id))?.grants).toEqual([
      { roleState: 'ACTIVE', permissionCode: 'iam.users.read', permissionState: 'RETIRED' },
    ]);

    await sql(`DELETE FROM iam_user_role_assignment WHERE user_id = $1::uuid`, id);
    expect((await source.readAuthorizationFacts(id))?.grants).toEqual([]);
  });
});
