import type { IamPersistenceClient } from '@vertex-os/database/iam';
import type {
  DepartmentCode,
  DepartmentId,
  DepartmentState,
  DepartmentView,
  Description,
  EntityName,
  OrganizationStore,
} from '@vertex-os/iam/persistence';
import {
  departmentStateFromDatabase,
  departmentStateToDatabase,
  knownLabel,
} from './enum-mapping.js';
import { lockUserRow } from './user-lock.js';

interface DepartmentRow {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly state: string;
  readonly version: number;
}

export const departmentSelect = {
  id: true,
  code: true,
  name: true,
  description: true,
  state: true,
  version: true,
} as const;

export function mapDepartment(row: DepartmentRow): DepartmentView {
  return Object.freeze({
    id: row.id as DepartmentId,
    code: row.code as DepartmentCode,
    name: row.name as EntityName,
    description: row.description === null ? undefined : (row.description as Description),
    state: knownLabel<DepartmentState>(departmentStateFromDatabase, row.state),
    version: row.version,
  });
}

/**
 * Departments and memberships on one IAM transaction client (IAM-R05 D-05 to D-10, D-17). Every
 * decision is taken by IAM under the locks this store takes; its writes execute that decision and
 * throw when a row count differs, which only a broken lock assumption can cause.
 */
export function createOrganizationStore(client: IamPersistenceClient): OrganizationStore {
  return {
    async createDepartment({ code, name, description }) {
      // ON CONFLICT DO NOTHING: a concurrent creation of the same code waits for the other
      // transaction and then inserts nothing, instead of aborting this transaction (D-17).
      const rows = await client.iamDepartment.createManyAndReturn({
        data: [
          {
            code,
            name,
            description: description ?? null,
            state: departmentStateToDatabase.ACTIVE,
            version: 1,
          },
        ],
        skipDuplicates: true,
        select: departmentSelect,
      });
      const row = rows[0];
      return row === undefined
        ? { outcome: 'code-taken' }
        : { outcome: 'created', department: mapDepartment(row) };
    },

    async lockDepartment(id, mode) {
      const rows =
        mode === 'update'
          ? await client.$queryRaw<DepartmentRow[]>`
              SELECT id::text, code, name, description, state::text, version
              FROM iam_department WHERE id = ${id}::uuid FOR UPDATE`
          : await client.$queryRaw<DepartmentRow[]>`
              SELECT id::text, code, name, description, state::text, version
              FROM iam_department WHERE id = ${id}::uuid FOR SHARE`;
      const row = rows[0];
      return row === undefined ? undefined : mapDepartment(row);
    },

    async writeDepartment({ id, expectedVersion, changes }) {
      const rows = await client.iamDepartment.updateManyAndReturn({
        where: { id, version: expectedVersion },
        data: {
          ...(changes.name === undefined ? {} : { name: changes.name }),
          ...(changes.description === undefined ? {} : { description: changes.description }),
          ...(changes.state === undefined
            ? {}
            : { state: departmentStateToDatabase[changes.state] }),
          version: { increment: 1 },
          updatedAt: new Date(),
        },
        select: departmentSelect,
      });
      const row = rows[0];
      if (rows.length !== 1 || row === undefined) {
        throw new Error('A locked department changed its version.');
      }
      return mapDepartment(row);
    },

    lockUser: (id) => lockUserRow(client, id),

    async readMemberships(userId) {
      const rows = await client.iamDepartmentMembership.findMany({
        where: { userId },
        select: { departmentId: true, isPrimary: true, department: { select: { state: true } } },
        orderBy: { departmentId: 'asc' },
      });
      return rows.map((row) => ({
        departmentId: row.departmentId as DepartmentId,
        isPrimary: row.isPrimary,
        departmentState: departmentStateFromDatabase[row.department.state],
      }));
    },

    async insertMembership({ userId, departmentId, isPrimary }) {
      await client.iamDepartmentMembership.create({
        data: { userId, departmentId, isPrimary },
        select: { userId: true },
      });
    },

    async setMembershipPrimary({ userId, departmentId, isPrimary }) {
      const { count } = await client.iamDepartmentMembership.updateMany({
        where: { userId, departmentId },
        data: { isPrimary, updatedAt: new Date() },
      });
      if (count !== 1) throw new Error('A membership changed under the user lock.');
    },

    async deleteMembership({ userId, departmentId }) {
      const { count } = await client.iamDepartmentMembership.deleteMany({
        where: { userId, departmentId },
      });
      if (count !== 1) throw new Error('A membership changed under the user lock.');
    },
  };
}
