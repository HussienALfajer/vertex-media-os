import { createFileRoute } from '@tanstack/react-router';
import { PAGE_SIZES, type PageSize } from '@vertex-os/ui';
import { ACCESS_STATES, type AccessState } from '../../../features/iam/iam-api';
import { UserDirectory, type DirectoryParams } from '../../../features/iam/users/user-directory';

export interface DirectorySearch {
  readonly page?: number | undefined;
  readonly pageSize?: PageSize | undefined;
  readonly accessState?: AccessState | undefined;
}

/** Only non-sensitive list state is kept in the address (IAM-R08B D-03). */
export const Route = createFileRoute('/_app/users/')({
  validateSearch: (search: Record<string, unknown>): DirectorySearch => {
    const page = Number(search['page']);
    const pageSize = PAGE_SIZES.find((size) => size === Number(search['pageSize']));
    const accessState = ACCESS_STATES.find((state) => state === search['accessState']);
    return {
      ...(Number.isInteger(page) && page > 1 && page <= 10_000 ? { page } : {}),
      ...(pageSize !== undefined && pageSize !== 25 ? { pageSize } : {}),
      ...(accessState === undefined ? {} : { accessState }),
    };
  },
  component: UsersPage,
});

function UsersPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const params: DirectoryParams = {
    page: search.page ?? 1,
    pageSize: search.pageSize ?? 25,
    accessState: search.accessState,
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
          },
        })
      }
    />
  );
}
