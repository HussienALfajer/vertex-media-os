import { createFileRoute } from '@tanstack/react-router';
import { PERMISSION_STATES, type PermissionState } from '../../../features/iam/iam-api';
import {
  listParams,
  listSearch,
  toListSearch,
  type ListSearch,
} from '../../../features/iam/organization/list-search';
import { PermissionCatalog } from '../../../features/iam/organization/permission-list';

/** Only non-sensitive list state is kept in the address (IAM-R08C D-02). */
export const Route = createFileRoute('/_app/permissions/')({
  validateSearch: (search: Record<string, unknown>): ListSearch<PermissionState> =>
    listSearch(search, PERMISSION_STATES),
  component: PermissionsPage,
});

function PermissionsPage() {
  // Applied again to what is read: the router can expose raw address parameters.
  const params = listParams(listSearch(Route.useSearch(), PERMISSION_STATES));
  const navigate = Route.useNavigate();
  return (
    <PermissionCatalog
      params={params}
      onParamsChange={(next) => void navigate({ search: toListSearch(next) })}
    />
  );
}
