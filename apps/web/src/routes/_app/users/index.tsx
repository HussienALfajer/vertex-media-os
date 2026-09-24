import { createFileRoute } from '@tanstack/react-router';
import { PAGE_SIZES, type PageSize } from '@vertex-os/ui';
import { ACCESS_STATES, type AccessState } from '../../../features/iam/iam-api';
import { idParam } from '../../../features/iam/organization/list-search';
import { UserDirectory, type DirectoryParams } from '../../../features/iam/users/user-directory';

export interface DirectorySearch {
  readonly page?: number | undefined;
  readonly pageSize?: PageSize | undefined;
  readonly accessState?: AccessState | undefined;
  readonly departmentId?: string | undefined;
  readonly roleId?: string | undefined;
}

/** Only non-sensitive list state is kept in the address (IAM-R08B D-03). */
export const Route = createFileRoute('/_app/users/')({
  validateSearch: (search: Record<string, unknown>): DirectorySearch => directorySearch(search),
  component: UsersPage,
});

/**
 * Keeps only valid, non-default values. The page applies it again to what it reads, because the
 * router can still expose raw address parameters next to the validated ones.
 */
function directorySearch(search: Record<string, unknown>): DirectorySearch {
  const page = Number(search['page']);
  const pageSize = PAGE_SIZES.find((size) => size === Number(search['pageSize']));
  const accessState = ACCESS_STATES.find((state) => state === search['accessState']);
  const departmentId = idParam(search['departmentId']);
  const roleId = idParam(search['roleId']);
  return {
    ...(Number.isInteger(page) && page > 1 && page <= 10_000 ? { page } : {}),
    ...(pageSize !== undefined && pageSize !== 25 ? { pageSize } : {}),
    ...(accessState === undefined ? {} : { accessState }),
    ...(departmentId === undefined ? {} : { departmentId }),
    ...(roleId === undefined ? {} : { roleId }),
  };
}

function UsersPage() {
  const search = directorySearch(Route.useSearch());
  const navigate = Route.useNavigate();
  const params: DirectoryParams = {
    page: search.page ?? 1,
    pageSize: search.pageSize ?? 25,
    accessState: search.accessState,
    departmentId: search.departmentId,
    roleId: search.roleId,
  };
  return (
    <UserDirectory
      params={params}
      onParamsChange={(next) =>
        void navigate({
          search: {
            ...(next.page > 1 ? { page: next.page } : {}),
            ...(next.pageSize !== 25 ? { pageSize: next.pageSize } : {}),
            ...(next.accessState === undefined ? {} : { accessState: next.accessState }),
            ...(next.departmentId === undefined ? {} : { departmentId: next.departmentId }),
            ...(next.roleId === undefined ? {} : { roleId: next.roleId }),
          },
        })
      }
    />
  );
}
