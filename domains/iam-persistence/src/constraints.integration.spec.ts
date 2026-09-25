import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  invalidDepartmentRoleCodes,
  invalidEmails,
  invalidModuleCodes,
  invalidPermissionCodes,
  validDepartmentRoleCodes,
  validEmails,
  validModuleCodes,
  validPermissionCodes,
} from '../test-support/validation-fixtures.js';
import { startMigratedPostgres, type MigratedPostgres } from '../test-support/postgres.js';

const USER = `INSERT INTO iam_application_user
  (email, display_name, access_state, identity_sync_state, invitation_delivery_state,
   identity_issuer, identity_subject, invitation_sent_at, first_activated_at, version)
  VALUES ($1, $2, $3::iam_user_access_state, $4::iam_identity_sync_state,
    $5::iam_invitation_delivery_state, $6, $7, $8, $9, $10)`;
const DEPARTMENT = `INSERT INTO iam_department (code, name, description, state, version)
  VALUES ($1, $2, $3, $4::iam_department_state, $5)`;
const ROLE = `INSERT INTO iam_role (code, name, description, state, is_system, version)
  VALUES ($1, $2, $3, $4::iam_role_state, $5, $6)`;
const PERMISSION = `INSERT INTO iam_permission (code, owning_module, name, description, state, sensitivity)
  VALUES ($1, $2, $3, $4, $5::iam_permission_state, $6::iam_permission_sensitivity)`;
const MISSING_ID = '00000000-0000-4000-8000-000000000099';

describe('named IAM database constraints', () => {
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

  async function insertUser(
    email: string,
    options: {
      name?: string;
      access?: string;
      sync?: string;
      invitation?: string;
      issuer?: string | null;
      subject?: string | null;
      sentAt?: Date | null;
      activatedAt?: Date | null;
      version?: number;
    } = {},
  ): Promise<void> {
    await postgres.client.$executeRawUnsafe(
      USER,
      email,
      options.name ?? 'Synthetic User',
      options.access ?? 'INVITED',
      options.sync ?? 'PENDING',
      options.invitation ?? 'NOT_SENT',
      options.issuer ?? null,
      options.subject ?? null,
      options.sentAt ?? null,
      options.activatedAt ?? null,
      options.version ?? 1,
    );
  }

  async function insertDepartment(
    code = 'test-dept',
    options: {
      name?: string;
      description?: string | null;
      state?: string;
      version?: number;
    } = {},
  ): Promise<string> {
    await postgres.client.$executeRawUnsafe(
      DEPARTMENT,
      code,
      options.name ?? 'Test Department',
      options.description ?? null,
      options.state ?? 'ACTIVE',
      options.version ?? 1,
    );
    const [row] = await postgres.client.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM iam_department WHERE code = ${code}`;
    if (!row) throw new Error('Department fixture missing');
    return row.id;
  }

  async function insertRole(
    code = 'test-role',
    options: {
      name?: string;
      description?: string | null;
      state?: string;
      isSystem?: boolean;
      version?: number;
    } = {},
  ): Promise<string> {
    await postgres.client.$executeRawUnsafe(
      ROLE,
      code,
      options.name ?? 'Test Role',
      options.description ?? null,
      options.state ?? 'ACTIVE',
      options.isSystem ?? false,
      options.version ?? 1,
    );
    const [row] = await postgres.client.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM iam_role WHERE code = ${code}`;
    if (!row) throw new Error('Role fixture missing');
    return row.id;
  }

  async function insertPermission(
    code = 'iam.users.read',
    module = 'iam',
    options: {
      name?: string;
      description?: string;
      state?: string;
      sensitivity?: string;
    } = {},
  ): Promise<void> {
    await postgres.client.$executeRawUnsafe(
      PERMISSION,
      code,
      module,
      options.name ?? 'Read users',
      options.description ?? 'Allows reading users',
      options.state ?? 'ACTIVE',
      options.sensitivity ?? 'STANDARD',
    );
  }

  function causeOf(error: unknown): Record<string, unknown> | undefined {
    if (typeof error !== 'object' || error === null) return undefined;
    const meta = (error as { meta?: { driverAdapterError?: { cause?: Record<string, unknown> } } })
      .meta;
    return meta?.driverAdapterError?.cause;
  }

  async function expectViolation(
    sql: string,
    values: readonly unknown[],
    state: string,
    constraint: string,
  ): Promise<void> {
    const error: unknown = await postgres.client
      .$executeRawUnsafe(sql, ...values)
      .catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(Error);
    expect(causeOf(error)).toMatchObject({ originalCode: state });
    if (state === '23514') {
      // Prisma 7.10's driver adapter drops the structured CHECK constraint name.
      // This test-only assertion verifies PostgreSQL's named rejection; production
      // classification never reads message text.
      expect(causeOf(error)?.['originalMessage']).toContain(`"${constraint}"`);
    } else {
      expect(causeOf(error)).toMatchObject({ constraint: { index: constraint } });
    }
  }

  async function expectEnumFailure(sql: string, values: readonly unknown[]): Promise<void> {
    const error: unknown = await postgres.client
      .$executeRawUnsafe(sql, ...values)
      .catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(Error);
    expect(causeOf(error)).toMatchObject({ originalCode: '22P02' });
    // PostgreSQL enum input errors have no pg_constraint name; the enum type names
    // are asserted in the complete catalog test below.
    expect(causeOf(error)?.['constraint']).toBeUndefined();
  }

  it('keeps normalized email unique even for a TERMINATED holder', async () => {
    await insertUser('reserved@example.invalid', { access: 'TERMINATED' });
    await expectViolation(
      USER,
      [
        'reserved@example.invalid',
        'Second',
        'INVITED',
        'PENDING',
        'NOT_SENT',
        null,
        null,
        null,
        null,
        1,
      ],
      '23505',
      'iam_application_user_email_key',
    );
  });

  it.each(validEmails)('accepts normalized email fixture %s', async (email) => {
    await insertUser(email);
  });

  it.each([...invalidEmails, 'UPPER@example.invalid', ' user@example.invalid '])(
    'rejects unnormalized email fixture %s',
    async (email) => {
      await expectViolation(
        USER,
        [email, 'User', 'INVITED', 'PENDING', 'NOT_SENT', null, null, null, null, 1],
        '23514',
        'iam_application_user_email_normalized_ck',
      );
    },
  );

  it('requires issuer and subject together, nonempty, and allows two unbound users', async () => {
    await expectViolation(
      USER,
      [
        'issuer-only@example.invalid',
        'User',
        'INVITED',
        'PENDING',
        'NOT_SENT',
        'issuer',
        null,
        null,
        null,
        1,
      ],
      '23514',
      'iam_application_user_identity_pair_ck',
    );
    await expectViolation(
      USER,
      [
        'subject-only@example.invalid',
        'User',
        'INVITED',
        'PENDING',
        'NOT_SENT',
        null,
        'subject',
        null,
        null,
        1,
      ],
      '23514',
      'iam_application_user_identity_pair_ck',
    );
    await expectViolation(
      USER,
      [
        'empty-issuer@example.invalid',
        'User',
        'INVITED',
        'PENDING',
        'NOT_SENT',
        '',
        'subject',
        null,
        null,
        1,
      ],
      '23514',
      'iam_application_user_identity_pair_ck',
    );
    await insertUser('unbound-one@example.invalid');
    await insertUser('unbound-two@example.invalid');
  });

  it('keeps a bound issuer/subject pair unique', async () => {
    await insertUser('identity-one@example.invalid', { issuer: 'issuer', subject: 'subject' });
    await expectViolation(
      USER,
      [
        'identity-two@example.invalid',
        'User',
        'INVITED',
        'PENDING',
        'NOT_SENT',
        'issuer',
        'subject',
        null,
        null,
        1,
      ],
      '23505',
      'iam_application_user_identity_key',
    );
  });

  it('requires bound identity and first activation for ACTIVE and no activation for INVITED', async () => {
    const instant = new Date('2026-01-01T00:00:00.000Z');
    await expectViolation(
      USER,
      [
        'active-no-subject@example.invalid',
        'User',
        'ACTIVE',
        'SYNCED',
        'NOT_SENT',
        null,
        null,
        null,
        instant,
        1,
      ],
      '23514',
      'iam_application_user_active_ck',
    );
    await expectViolation(
      USER,
      [
        'active-no-time@example.invalid',
        'User',
        'ACTIVE',
        'SYNCED',
        'NOT_SENT',
        'issuer',
        'subject',
        null,
        null,
        1,
      ],
      '23514',
      'iam_application_user_active_ck',
    );
    await expectViolation(
      USER,
      [
        'invited-with-time@example.invalid',
        'User',
        'INVITED',
        'PENDING',
        'NOT_SENT',
        null,
        null,
        null,
        instant,
        1,
      ],
      '23514',
      'iam_application_user_invited_ck',
    );
    for (const state of ['SUSPENDED', 'DISABLED', 'TERMINATED']) {
      await insertUser(`${state.toLowerCase()}-never@example.invalid`, { access: state });
      await insertUser(`${state.toLowerCase()}-activated@example.invalid`, {
        access: state,
        activatedAt: instant,
      });
    }
  });

  it('requires a sent timestamp for SENT and no timestamp for NOT_SENT, while FAILED permits both', async () => {
    const instant = new Date('2026-01-01T00:00:00.000Z');
    await expectViolation(
      USER,
      [
        'sent-no-time@example.invalid',
        'User',
        'INVITED',
        'PENDING',
        'SENT',
        null,
        null,
        null,
        null,
        1,
      ],
      '23514',
      'iam_application_user_invitation_sent_ck',
    );
    await expectViolation(
      USER,
      [
        'not-sent-with-time@example.invalid',
        'User',
        'INVITED',
        'PENDING',
        'NOT_SENT',
        null,
        null,
        instant,
        null,
        1,
      ],
      '23514',
      'iam_application_user_invitation_sent_ck',
    );
    await insertUser('failed-no-time@example.invalid', { invitation: 'FAILED' });
    await insertUser('failed-with-time@example.invalid', { invitation: 'FAILED', sentAt: instant });
  });

  it('rejects unknown values for all seven enum columns', async () => {
    await expectEnumFailure(USER, [
      'bad-access@example.invalid',
      'User',
      'UNKNOWN',
      'PENDING',
      'NOT_SENT',
      null,
      null,
      null,
      null,
      1,
    ]);
    await expectEnumFailure(USER, [
      'bad-sync@example.invalid',
      'User',
      'INVITED',
      'UNKNOWN',
      'NOT_SENT',
      null,
      null,
      null,
      null,
      1,
    ]);
    await expectEnumFailure(USER, [
      'bad-invitation@example.invalid',
      'User',
      'INVITED',
      'PENDING',
      'UNKNOWN',
      null,
      null,
      null,
      null,
      1,
    ]);
    await expectEnumFailure(DEPARTMENT, ['dept', 'Dept', null, 'UNKNOWN', 1]);
    await expectEnumFailure(ROLE, ['role', 'Role', null, 'UNKNOWN', false, 1]);
    await expectEnumFailure(PERMISSION, [
      'iam.users.read',
      'iam',
      'Read',
      'Description',
      'UNKNOWN',
      'STANDARD',
    ]);
    await expectEnumFailure(PERMISSION, [
      'iam.users.read',
      'iam',
      'Read',
      'Description',
      'ACTIVE',
      'UNKNOWN',
    ]);
  });

  it('has no lifecycle or is_system defaults and rejects omitted required states', async () => {
    const defaults = await postgres.client.$queryRaw<
      Array<{ table_name: string; column_name: string; column_default: string | null }>
    >`
      SELECT table_name, column_name, column_default FROM information_schema.columns
      WHERE (table_name = 'iam_application_user' AND column_name IN
        ('access_state', 'identity_sync_state', 'invitation_delivery_state'))
        OR (table_name = 'iam_role' AND column_name = 'is_system')`;
    expect(defaults).toHaveLength(4);
    for (const column of defaults) expect(column.column_default).toBeNull();
    for (const [column, values] of [
      [
        'access_state',
        [
          'no-access@example.invalid',
          'User',
          null,
          'PENDING',
          'NOT_SENT',
          null,
          null,
          null,
          null,
          1,
        ],
      ],
      [
        'identity_sync_state',
        ['no-sync@example.invalid', 'User', 'INVITED', null, 'NOT_SENT', null, null, null, null, 1],
      ],
      [
        'invitation_delivery_state',
        [
          'no-invitation@example.invalid',
          'User',
          'INVITED',
          'PENDING',
          null,
          null,
          null,
          null,
          null,
          1,
        ],
      ],
    ] as const) {
      const error: unknown = await postgres.client
        .$executeRawUnsafe(USER, ...values)
        .catch((failure: unknown) => failure);
      expect(causeOf(error)).toMatchObject({ originalCode: '23502' });
      expect(causeOf(error)?.['originalMessage']).toContain(`column "${column}"`);
    }
    const roleError: unknown = await postgres.client
      .$executeRawUnsafe(
        'INSERT INTO iam_role (code, name, state) VALUES ($1, $2, $3::iam_role_state)',
        'no-system',
        'No system default',
        'ACTIVE',
      )
      .catch((failure: unknown) => failure);
    expect(causeOf(roleError)).toMatchObject({ originalCode: '23502' });
    expect(causeOf(roleError)?.['originalMessage']).toContain('column "is_system"');
  });

  it.each(validDepartmentRoleCodes)('accepts department and role code fixture %s', async (code) => {
    await insertDepartment(code);
    await insertRole(code);
  });

  it.each(invalidDepartmentRoleCodes)(
    'rejects department and role code fixture %s',
    async (code) => {
      await expectViolation(
        DEPARTMENT,
        [code, 'Dept', null, 'ACTIVE', 1],
        '23514',
        'iam_department_code_ck',
      );
      await expectViolation(
        ROLE,
        [code, 'Role', null, 'ACTIVE', false, 1],
        '23514',
        'iam_role_code_ck',
      );
    },
  );

  it.each(validModuleCodes)('accepts owning module fixture %s', async (module) => {
    await insertPermission(`${module}.users.read`, module);
  });

  it.each(invalidModuleCodes)('rejects owning module fixture %s', async (module) => {
    await expectViolation(
      PERMISSION,
      ['iam.users.read', module, 'Read', 'Description', 'ACTIVE', 'STANDARD'],
      '23514',
      'iam_permission_code_module_ck',
    );
  });

  it('enforces the owning-module length check when code prefix matches', async () => {
    const longModule = 'i'.repeat(33);
    await expectViolation(
      PERMISSION,
      [`${longModule}.users.read`, longModule, 'Read', 'Description', 'ACTIVE', 'STANDARD'],
      '23514',
      'iam_permission_owning_module_ck',
    );
  });

  it('enforces the owning-module lower length bound when code prefix matches', async () => {
    await expectViolation(
      PERMISSION,
      ['i.users.read', 'i', 'Read', 'Description', 'ACTIVE', 'STANDARD'],
      '23514',
      'iam_permission_owning_module_ck',
    );
  });

  it.each(validPermissionCodes)('accepts permission code fixture %s', async (code) => {
    await insertPermission(code);
  });

  it.each(invalidPermissionCodes)('rejects permission code fixture %s', async (code) => {
    await expectViolation(
      PERMISSION,
      [code, 'iam', 'Read', 'Description', 'ACTIVE', 'STANDARD'],
      '23514',
      'iam_permission_code_ck',
    );
  });

  it('requires the permission code prefix to equal owning_module', async () => {
    await expectViolation(
      PERMISSION,
      ['iam.users.read', 'crm', 'Read', 'Description', 'ACTIVE', 'STANDARD'],
      '23514',
      'iam_permission_code_module_ck',
    );
  });

  it('checks names, descriptions and user display name by Unicode code points', async () => {
    await insertUser('arabic@example.invalid', { name: 'اسم عربي' });
    await insertUser('astral@example.invalid', { name: '😀'.repeat(200) });
    await expectViolation(
      USER,
      [
        'overlong@example.invalid',
        '😀'.repeat(201),
        'INVITED',
        'PENDING',
        'NOT_SENT',
        null,
        null,
        null,
        null,
        1,
      ],
      '23514',
      'iam_application_user_display_name_ck',
    );
    await expectViolation(
      USER,
      [
        'spaced@example.invalid',
        ' Spaced ',
        'INVITED',
        'PENDING',
        'NOT_SENT',
        null,
        null,
        null,
        null,
        1,
      ],
      '23514',
      'iam_application_user_display_name_ck',
    );
    await expectViolation(
      USER,
      [
        'control@example.invalid',
        'Bad\u0001',
        'INVITED',
        'PENDING',
        'NOT_SENT',
        null,
        null,
        null,
        null,
        1,
      ],
      '23514',
      'iam_application_user_display_name_ck',
    );
    await expectViolation(
      DEPARTMENT,
      ['dept', 'x'.repeat(201), null, 'ACTIVE', 1],
      '23514',
      'iam_department_name_ck',
    );
    await expectViolation(
      DEPARTMENT,
      ['dept', 'Dept', '', 'ACTIVE', 1],
      '23514',
      'iam_department_description_ck',
    );
    await expectViolation(
      DEPARTMENT,
      ['dept', 'Dept', 'x'.repeat(2001), 'ACTIVE', 1],
      '23514',
      'iam_department_description_ck',
    );
    await expectViolation(
      ROLE,
      ['role', 'x'.repeat(201), null, 'ACTIVE', false, 1],
      '23514',
      'iam_role_name_ck',
    );
    await expectViolation(
      ROLE,
      ['role', 'Role', '', 'ACTIVE', false, 1],
      '23514',
      'iam_role_description_ck',
    );
    await expectViolation(
      ROLE,
      ['role', 'Role', 'x'.repeat(2001), 'ACTIVE', false, 1],
      '23514',
      'iam_role_description_ck',
    );
    await expectViolation(
      PERMISSION,
      ['iam.users.read', 'iam', 'x'.repeat(201), 'Description', 'ACTIVE', 'STANDARD'],
      '23514',
      'iam_permission_name_ck',
    );
    await expectViolation(
      PERMISSION,
      ['iam.users.read', 'iam', 'Read', '', 'ACTIVE', 'STANDARD'],
      '23514',
      'iam_permission_description_ck',
    );
    await expectViolation(
      PERMISSION,
      ['iam.users.read', 'iam', 'Read', 'x'.repeat(2001), 'ACTIVE', 'STANDARD'],
      '23514',
      'iam_permission_description_ck',
    );
  });

  it('rejects an inactive system role', async () => {
    await expectViolation(
      ROLE,
      ['system-administrator', 'System', null, 'INACTIVE', true, 1],
      '23514',
      'iam_role_system_active_ck',
    );
  });

  it('allows only the reserved code to be a system role, and only as a system role', async () => {
    await insertRole('system-administrator', { name: 'System Administrator', isSystem: true });
    await postgres.client.$executeRawUnsafe('DELETE FROM iam_role');
    await expectViolation(
      ROLE,
      ['system-administrator', 'Impostor', null, 'ACTIVE', false, 1],
      '23514',
      'iam_role_system_code_ck',
    );
    await expectViolation(
      ROLE,
      ['admins', 'Admins', null, 'ACTIVE', true, 1],
      '23514',
      'iam_role_system_code_ck',
    );
    await insertRole('content-editors', { isSystem: false });
  });

  it('enforces membership primary uniqueness and composite keys', async () => {
    await insertUser('member@example.invalid');
    const [user] = await postgres.client.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM iam_application_user`;
    if (!user) throw new Error('User fixture missing');
    const first = await insertDepartment('first');
    const second = await insertDepartment('second');
    const third = await insertDepartment('third');
    await postgres.client.$executeRawUnsafe(
      'INSERT INTO iam_department_membership (user_id, department_id, is_primary) VALUES ($1::uuid, $2::uuid, true)',
      user.id,
      first,
    );
    await expectViolation(
      'INSERT INTO iam_department_membership (user_id, department_id, is_primary) VALUES ($1::uuid, $2::uuid, false)',
      [user.id, first],
      '23505',
      'iam_department_membership_pkey',
    );
    await expectViolation(
      'INSERT INTO iam_department_membership (user_id, department_id, is_primary) VALUES ($1::uuid, $2::uuid, true)',
      [user.id, second],
      '23505',
      'iam_department_membership_one_primary_key',
    );
    await postgres.client.$executeRawUnsafe(
      'INSERT INTO iam_department_membership (user_id, department_id, is_primary) VALUES ($1::uuid, $2::uuid, false), ($1::uuid, $3::uuid, false)',
      user.id,
      second,
      third,
    );
    await insertUser('other@example.invalid');
    const [other] = await postgres.client.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM iam_application_user WHERE email = 'other@example.invalid'`;
    if (!other) throw new Error('Other user fixture missing');
    await postgres.client.$executeRawUnsafe(
      'INSERT INTO iam_department_membership (user_id, department_id, is_primary) VALUES ($1::uuid, $2::uuid, true)',
      other.id,
      second,
    );
  });

  it('enforces composite keys on role assignment and role permission', async () => {
    await insertUser('assigned@example.invalid');
    const [user] = await postgres.client.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM iam_application_user`;
    if (!user) throw new Error('User fixture missing');
    const role = await insertRole();
    await insertPermission();
    await postgres.client.$executeRawUnsafe(
      'INSERT INTO iam_user_role_assignment (user_id, role_id) VALUES ($1::uuid, $2::uuid)',
      user.id,
      role,
    );
    await expectViolation(
      'INSERT INTO iam_user_role_assignment (user_id, role_id) VALUES ($1::uuid, $2::uuid)',
      [user.id, role],
      '23505',
      'iam_user_role_assignment_pkey',
    );
    await postgres.client.$executeRawUnsafe(
      'INSERT INTO iam_role_permission (role_id, permission_code) VALUES ($1::uuid, $2)',
      role,
      'iam.users.read',
    );
    await expectViolation(
      'INSERT INTO iam_role_permission (role_id, permission_code) VALUES ($1::uuid, $2)',
      [role, 'iam.users.read'],
      '23505',
      'iam_role_permission_pkey',
    );
  });

  it('rejects missing references for all six foreign keys', async () => {
    await insertUser('refs@example.invalid');
    const [user] = await postgres.client.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM iam_application_user`;
    if (!user) throw new Error('User fixture missing');
    const dept = await insertDepartment();
    const role = await insertRole();
    await insertPermission();
    await expectViolation(
      'INSERT INTO iam_department_membership (user_id, department_id, is_primary) VALUES ($1::uuid, $2::uuid, false)',
      [MISSING_ID, dept],
      '23503',
      'iam_department_membership_user_id_fkey',
    );
    await expectViolation(
      'INSERT INTO iam_department_membership (user_id, department_id, is_primary) VALUES ($1::uuid, $2::uuid, false)',
      [user.id, MISSING_ID],
      '23503',
      'iam_department_membership_department_id_fkey',
    );
    await expectViolation(
      'INSERT INTO iam_user_role_assignment (user_id, role_id) VALUES ($1::uuid, $2::uuid)',
      [MISSING_ID, role],
      '23503',
      'iam_user_role_assignment_user_id_fkey',
    );
    await expectViolation(
      'INSERT INTO iam_user_role_assignment (user_id, role_id) VALUES ($1::uuid, $2::uuid)',
      [user.id, MISSING_ID],
      '23503',
      'iam_user_role_assignment_role_id_fkey',
    );
    await expectViolation(
      'INSERT INTO iam_role_permission (role_id, permission_code) VALUES ($1::uuid, $2)',
      [MISSING_ID, 'iam.users.read'],
      '23503',
      'iam_role_permission_role_id_fkey',
    );
    await expectViolation(
      'INSERT INTO iam_role_permission (role_id, permission_code) VALUES ($1::uuid, $2)',
      [role, 'iam.users.missing'],
      '23503',
      'iam_role_permission_permission_code_fkey',
    );
  });

  it('rejects deleting referenced user, department, role and permission', async () => {
    await insertUser('delete@example.invalid');
    const [user] = await postgres.client.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM iam_application_user`;
    if (!user) throw new Error('User fixture missing');
    const dept = await insertDepartment();
    const role = await insertRole();
    await insertPermission();
    await postgres.client.$executeRawUnsafe(
      'INSERT INTO iam_department_membership (user_id, department_id, is_primary) VALUES ($1::uuid, $2::uuid, false)',
      user.id,
      dept,
    );
    await expectViolation(
      'DELETE FROM iam_application_user WHERE id = $1::uuid',
      [user.id],
      '23001',
      'iam_department_membership_user_id_fkey',
    );
    await expectViolation(
      'DELETE FROM iam_department WHERE id = $1::uuid',
      [dept],
      '23001',
      'iam_department_membership_department_id_fkey',
    );
    await postgres.client.$executeRawUnsafe(
      'INSERT INTO iam_role_permission (role_id, permission_code) VALUES ($1::uuid, $2)',
      role,
      'iam.users.read',
    );
    await expectViolation(
      'DELETE FROM iam_role WHERE id = $1::uuid',
      [role],
      '23001',
      'iam_role_permission_role_id_fkey',
    );
    await expectViolation(
      'DELETE FROM iam_permission WHERE code = $1',
      ['iam.users.read'],
      '23001',
      'iam_role_permission_permission_code_fkey',
    );
  });

  it('rejects zero version for users, departments and roles', async () => {
    await expectViolation(
      USER,
      [
        'version@example.invalid',
        'User',
        'INVITED',
        'PENDING',
        'NOT_SENT',
        null,
        null,
        null,
        null,
        0,
      ],
      '23514',
      'iam_application_user_version_ck',
    );
    await expectViolation(
      DEPARTMENT,
      ['dept', 'Dept', null, 'ACTIVE', 0],
      '23514',
      'iam_department_version_ck',
    );
    await expectViolation(
      ROLE,
      ['role', 'Role', null, 'ACTIVE', false, 0],
      '23514',
      'iam_role_version_ck',
    );
  });

  it('has the complete, untruncated constraint, index and enum name catalog', async () => {
    const constraints = await postgres.client.$queryRaw<Array<{ name: string }>>`
      SELECT conname AS name FROM pg_constraint WHERE contype IN ('p', 'u', 'f', 'c') AND conrelid IN
        (SELECT oid FROM pg_class WHERE relname LIKE 'iam_%' AND relkind = 'r')`;
    const indexes = await postgres.client.$queryRaw<Array<{ name: string }>>`
      SELECT indexname AS name FROM pg_indexes WHERE schemaname = 'public' AND tablename LIKE 'iam_%'`;
    const names = new Set([...constraints, ...indexes].map((row) => row.name));
    const expected = [
      'iam_application_user_pkey',
      'iam_application_user_email_key',
      'iam_application_user_identity_key',
      'iam_application_user_email_normalized_ck',
      'iam_application_user_display_name_ck',
      'iam_application_user_identity_pair_ck',
      'iam_application_user_active_ck',
      'iam_application_user_invited_ck',
      'iam_application_user_invitation_sent_ck',
      'iam_application_user_version_ck',
      'iam_application_user_password_hash_ck',
      'iam_legacy_identity_mapping_pkey',
      'iam_legacy_identity_mapping_user_id_fkey',
      'iam_department_pkey',
      'iam_department_code_key',
      'iam_department_code_ck',
      'iam_department_name_ck',
      'iam_department_description_ck',
      'iam_department_version_ck',
      'iam_role_pkey',
      'iam_role_code_key',
      'iam_role_code_ck',
      'iam_role_name_ck',
      'iam_role_description_ck',
      'iam_role_system_active_ck',
      'iam_role_system_code_ck',
      'iam_role_version_ck',
      'iam_permission_pkey',
      'iam_permission_code_ck',
      'iam_permission_owning_module_ck',
      'iam_permission_code_module_ck',
      'iam_permission_name_ck',
      'iam_permission_description_ck',
      'iam_department_membership_pkey',
      'iam_department_membership_department_id_idx',
      'iam_department_membership_one_primary_key',
      'iam_department_membership_user_id_fkey',
      'iam_department_membership_department_id_fkey',
      'iam_user_role_assignment_pkey',
      'iam_user_role_assignment_role_id_idx',
      'iam_user_role_assignment_user_id_fkey',
      'iam_user_role_assignment_role_id_fkey',
      'iam_role_permission_pkey',
      'iam_role_permission_permission_code_idx',
      'iam_role_permission_role_id_fkey',
      'iam_role_permission_permission_code_fkey',
    ];
    expect([...names].sort()).toEqual([...expected].sort());
    for (const name of names) expect(Buffer.byteLength(name)).toBeLessThanOrEqual(63);
    // Every foreign key is ON DELETE RESTRICT ON UPDATE RESTRICT ('r') and not deferrable (A1-07).
    const foreignKeys = await postgres.client.$queryRaw<
      Array<{ name: string; onDelete: string; onUpdate: string; deferrable: boolean }>
    >`SELECT conname AS name, confdeltype::text AS "onDelete", confupdtype::text AS "onUpdate",
        condeferrable AS deferrable
      FROM pg_constraint WHERE contype = 'f' AND conrelid IN
        (SELECT oid FROM pg_class WHERE relname LIKE 'iam_%' AND relkind = 'r')
      ORDER BY conname COLLATE "C"`;
    expect(foreignKeys).toEqual(
      [
        'iam_department_membership_department_id_fkey',
        'iam_department_membership_user_id_fkey',
        'iam_legacy_identity_mapping_user_id_fkey',
        'iam_role_permission_permission_code_fkey',
        'iam_role_permission_role_id_fkey',
        'iam_user_role_assignment_role_id_fkey',
        'iam_user_role_assignment_user_id_fkey',
      ].map((name) => ({ name, onDelete: 'r', onUpdate: 'r', deferrable: false })),
    );
    const enums = await postgres.client.$queryRaw<Array<{ typname: string }>>`
      SELECT typname FROM pg_type WHERE typname LIKE 'iam_%' AND typtype = 'e'`;
    expect(enums.map((row) => row.typname).sort()).toEqual(
      [
        'iam_user_access_state',
        'iam_identity_sync_state',
        'iam_invitation_delivery_state',
        'iam_department_state',
        'iam_role_state',
        'iam_permission_state',
        'iam_permission_sensitivity',
      ].sort(),
    );
  });
});
