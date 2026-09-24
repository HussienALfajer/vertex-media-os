import { describe, expect, it } from 'vitest';
import type {
  DirectorySlice,
  IamDirectoryReader,
  UserDirectoryQuery,
} from './ports/directory-reader.js';
import { getRole, getUser, listDepartments, listPermissions, listUsers } from './directory.js';

const empty: DirectorySlice<never> = { items: [], total: 0 };

function reader() {
  const queries: unknown[] = [];
  const directory: IamDirectoryReader = {
    listUsers: async (query) => (queries.push(query), empty),
    findUser: async () => undefined,
    listDepartments: async (query) => (queries.push(query), empty),
    findDepartment: async () => undefined,
    listRoles: async (query) => (queries.push(query), empty),
    findRole: async () => undefined,
    listPermissions: async (query) => (queries.push(query), { items: [], total: 7 }),
  };
  return { queries, dependencies: { directory } };
}

const DEPARTMENT = '5b9c0d1e-2f30-4a41-8b52-6c7d8e9fa0b1';

describe('directory queries (IAM-R07 D-02, D-03)', () => {
  it('turns a page request into a bounded window with defaults', async () => {
    const { queries, dependencies } = reader();

    expect(await listUsers(dependencies, {})).toEqual({
      outcome: 'listed',
      page: { items: [], page: 1, pageSize: 25, total: 0 },
    });
    await listUsers(dependencies, {
      page: 3,
      pageSize: 10,
      search: '  Ada ',
      accessState: 'SUSPENDED',
      departmentId: DEPARTMENT,
    });

    expect(queries[1]).toEqual({
      offset: 20,
      limit: 10,
      search: 'Ada',
      accessState: 'SUSPENDED',
      departmentId: DEPARTMENT,
      roleId: undefined,
    } satisfies UserDirectoryQuery);
  });

  it('refuses out-of-bound pages, bad search text and unknown filters without reading', async () => {
    const { queries, dependencies } = reader();
    for (const [request, field] of [
      [{ page: 0 }, 'page'],
      [{ page: 10_001 }, 'page'],
      [{ page: 1.5 }, 'page'],
      [{ pageSize: 0 }, 'pageSize'],
      [{ pageSize: 101 }, 'pageSize'],
      [{ search: '   ' }, 'search'],
      [{ search: 'x'.repeat(101) }, 'search'],
      [{ search: 'a\u0000b' }, 'search'],
      [{ accessState: 'ENABLED' }, 'accessState'],
      [{ departmentId: 'not-a-uuid' }, 'departmentId'],
      [{ roleId: 'not-a-uuid' }, 'roleId'],
    ] as const) {
      expect(await listUsers(dependencies, request)).toEqual({ outcome: 'invalid', field });
    }
    expect(await listDepartments(dependencies, { state: 'DEPRECATED' })).toEqual({
      outcome: 'invalid',
      field: 'state',
    });
    expect(queries).toEqual([]);
  });

  it('reports the total of the reader and answers unknown or malformed identifiers', async () => {
    const { dependencies } = reader();
    expect(await listPermissions(dependencies, { state: 'DEPRECATED' })).toMatchObject({
      page: { total: 7 },
    });
    expect(await getUser(dependencies, { userId: DEPARTMENT })).toEqual({
      outcome: 'user-not-found',
    });
    expect(await getRole(dependencies, { roleId: 'x' })).toEqual({
      outcome: 'invalid',
      field: 'roleId',
    });
  });
});
