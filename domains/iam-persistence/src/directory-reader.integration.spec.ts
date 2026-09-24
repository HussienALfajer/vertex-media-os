import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type {
  DepartmentId,
  DirectoryWindow,
  RoleId,
  SearchText,
  UserId,
} from '@vertex-os/iam/persistence';
import { createIamDirectoryReader } from './index.js';
import { startMigratedPostgres, type MigratedPostgres } from '../test-support/postgres.js';

const DEPARTMENT = `INSERT INTO iam_department (code, name, state)
  VALUES ($1, $2, $3::iam_department_state) RETURNING id`;
const ROLE = `INSERT INTO iam_role (code, name, state, is_system)
  VALUES ($1, $2, $3::iam_role_state, false) RETURNING id`;
const PERMISSION = `INSERT INTO iam_permission (code, owning_module, name, description, state, sensitivity)
  VALUES ($1, 'iam', $2, 'Synthetic description', $3::iam_permission_state, 'PRIVILEGED')`;
const USER = `INSERT INTO iam_application_user
  (email, display_name, access_state, identity_issuer, identity_subject, identity_sync_state,
   invitation_delivery_state, invitation_sent_at, first_activated_at)
  VALUES ($1, $2, $3::iam_user_access_state, 'http://idp.test/realms/vertex', gen_random_uuid()::text,
   'SYNCED', 'SENT', now(), CASE WHEN $3 = 'INVITED' THEN NULL ELSE now() END) RETURNING id`;
const MISSING = '00000000-0000-4000-8000-000000000099';

const all = (search?: string): DirectoryWindow => ({
  offset: 0,
  limit: 100,
  search: search as SearchText | undefined,
});

/** The directory reader against real PostgreSQL (IAM-R07 D-02, D-03). */
describe('IamDirectoryReader against real PostgreSQL', () => {
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

  const reader = () => createIamDirectoryReader(postgres.database);

  async function insert(statement: string, ...values: unknown[]): Promise<string> {
    const rows = await postgres.client.$queryRawUnsafe<{ id: string }[]>(statement, ...values);
    const id = rows[0]?.id;
    if (id === undefined) throw new Error('seed row');
    return id;
  }

  async function sql(statement: string, ...values: unknown[]): Promise<void> {
    await postgres.client.$executeRawUnsafe(statement, ...values);
  }

  async function user(email: string, name: string, state = 'ACTIVE'): Promise<UserId> {
    return (await insert(USER, email, name, state)) as UserId;
  }

  const users = (query: Partial<Parameters<ReturnType<typeof reader>['listUsers']>[0]> = {}) =>
    reader().listUsers({
      ...all(),
      accessState: undefined,
      departmentId: undefined,
      roleId: undefined,
      ...query,
    });

  it('lists users in display-name order with memberships and roles, and no identity mapping', async () => {
    const studio = await insert(DEPARTMENT, 'studio', 'Studio', 'ACTIVE');
    const archive = await insert(DEPARTMENT, 'archive', 'Archive', 'INACTIVE');
    const editor = await insert(ROLE, 'editor', 'Editor', 'ACTIVE');
    const bea = await user('bea@example.test', 'Bea');
    const ada = await user('ada@example.test', 'Ada', 'SUSPENDED');
    await sql(
      `INSERT INTO iam_department_membership (user_id, department_id, is_primary)
         VALUES ($1::uuid, $2::uuid, true), ($1::uuid, $3::uuid, false)`,
      ada,
      studio,
      archive,
    );
    await sql(
      `INSERT INTO iam_user_role_assignment (user_id, role_id) VALUES ($1::uuid, $2::uuid)`,
      ada,
      editor,
    );

    const listed = await users();

    expect(listed.total).toBe(2);
    expect(listed.items.map((item) => item.id)).toEqual([ada, bea]);
    expect(listed.items[0]).toEqual({
      id: ada,
      email: 'ada@example.test',
      displayName: 'Ada',
      accessState: 'SUSPENDED',
      identitySyncState: 'SYNCED',
      invitationDeliveryState: 'SENT',
      departments: [
        { id: archive, code: 'archive', name: 'Archive', state: 'INACTIVE', isPrimary: false },
        { id: studio, code: 'studio', name: 'Studio', state: 'ACTIVE', isPrimary: true },
      ],
      roles: [{ id: editor, code: 'editor', name: 'Editor', state: 'ACTIVE', isSystem: false }],
    });
  });

  it('filters by access state, department and role, and pages with a total order', async () => {
    const studio = (await insert(DEPARTMENT, 'studio', 'Studio', 'ACTIVE')) as DepartmentId;
    const editor = (await insert(ROLE, 'editor', 'Editor', 'ACTIVE')) as RoleId;
    const ids: string[] = [];
    // Equal display names: the ID decides the order, so pages never overlap or skip.
    for (let index = 0; index < 5; index += 1) {
      ids.push(await user(`same-${index}@example.test`, 'Same Name'));
    }
    const invited = await user('invited@example.test', 'Zed', 'INVITED');
    await sql(
      `INSERT INTO iam_department_membership (user_id, department_id, is_primary)
         VALUES ($1::uuid, $2::uuid, false)`,
      invited,
      studio,
    );
    await sql(
      `INSERT INTO iam_user_role_assignment (user_id, role_id) VALUES ($1::uuid, $2::uuid)`,
      ids[0],
      editor,
    );

    expect((await users({ accessState: 'INVITED' })).items.map((item) => item.id)).toEqual([
      invited,
    ]);
    expect((await users({ departmentId: studio })).items.map((item) => item.id)).toEqual([invited]);
    expect((await users({ roleId: editor })).items.map((item) => item.id)).toEqual([ids[0]]);

    const first = await users({ offset: 0, limit: 2, accessState: 'ACTIVE' });
    const second = await users({ offset: 2, limit: 2, accessState: 'ACTIVE' });
    const third = await users({ offset: 4, limit: 2, accessState: 'ACTIVE' });
    expect(first.total).toBe(5);
    expect([...first.items, ...second.items, ...third.items].map((item) => item.id)).toEqual(
      [...ids].sort(),
    );
    expect((await users({ offset: 10, limit: 2 })).items).toEqual([]);
  });

  it('matches search text literally and case-insensitively on name and email', async () => {
    const percent = await user('percent@example.test', 'Growth 100% Team');
    const underscore = await user('under_score@example.test', 'Plain');
    await user('other@example.test', 'Growth 1000 Team');
    // Unescaped, `R_S` would also match the `rbs` of this name.
    await user('xyz@example.test', 'Orbs Team');
    const backslash = await user('slash@example.test', 'Back\\slash');

    expect((await users({ search: '100%' as SearchText })).items.map((item) => item.id)).toEqual([
      percent,
    ]);
    expect((await users({ search: 'R_S' as SearchText })).items.map((item) => item.id)).toEqual([
      underscore,
    ]);
    expect((await users({ search: 'GROWTH' as SearchText })).total).toBe(2);
    expect((await users({ search: 'k\\s' as SearchText })).items.map((item) => item.id)).toEqual([
      backslash,
    ]);
  });

  it('reads a user detail with its view fields, and nothing for an unknown user', async () => {
    const ada = await user('ada@example.test', 'Ada');

    const detail = await reader().findUser(ada);

    expect(detail).toMatchObject({
      id: ada,
      email: 'ada@example.test',
      accessState: 'ACTIVE',
      version: 1,
      departments: [],
      roles: [],
    });
    expect(Object.keys(detail ?? {})).not.toContain('identity');
    expect(detail?.createdAt).toBeInstanceOf(Date);
    await expect(reader().findUser(MISSING as UserId)).resolves.toBeUndefined();
  });

  it('lists departments and roles by code with state and search filters', async () => {
    await insert(DEPARTMENT, 'studio', 'Studio', 'ACTIVE');
    await insert(DEPARTMENT, 'archive', 'Old Archive', 'INACTIVE');
    const editor = await insert(ROLE, 'editor', 'Editor', 'ACTIVE');
    await insert(ROLE, 'auditor', 'Auditor', 'INACTIVE');
    await sql(PERMISSION, 'iam.users.read', 'Read users', 'ACTIVE');
    await sql(
      `INSERT INTO iam_role_permission (role_id, permission_code) VALUES ($1::uuid, 'iam.users.read')`,
      editor,
    );

    const departments = await reader().listDepartments({ ...all(), state: undefined });
    expect(departments.items.map((item) => item.code)).toEqual(['archive', 'studio']);
    expect(
      (await reader().listDepartments({ ...all('old'), state: undefined })).items.map(
        (item) => item.code,
      ),
    ).toEqual(['archive']);
    expect(
      (await reader().listRoles({ ...all(), state: 'ACTIVE' })).items.map((item) => item.code),
    ).toEqual(['editor']);
    await expect(reader().findRole(editor as RoleId)).resolves.toMatchObject({
      code: 'editor',
      permissionCodes: ['iam.users.read'],
      isSystem: false,
      version: 1,
    });
    await expect(reader().findRole(MISSING as RoleId)).resolves.toBeUndefined();
    await expect(reader().findDepartment(MISSING as DepartmentId)).resolves.toBeUndefined();
  });

  it('lists the permission catalog by code with its states', async () => {
    await sql(PERMISSION, 'iam.users.read', 'Read users', 'ACTIVE');
    await sql(PERMISSION, 'iam.roles.read', 'Read roles', 'DEPRECATED');

    const listed = await reader().listPermissions({ ...all(), state: undefined });

    expect(listed).toEqual({
      total: 2,
      items: [
        {
          code: 'iam.roles.read',
          owningModule: 'iam',
          name: 'Read roles',
          description: 'Synthetic description',
          state: 'DEPRECATED',
          sensitivity: 'PRIVILEGED',
        },
        expect.objectContaining({ code: 'iam.users.read', state: 'ACTIVE' }),
      ],
    });
    expect(
      (await reader().listPermissions({ ...all(), state: 'ACTIVE' })).items.map(
        (item) => item.code,
      ),
    ).toEqual(['iam.users.read']);
  });
});
