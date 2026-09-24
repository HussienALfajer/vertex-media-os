import { createFileRoute } from '@tanstack/react-router';
import { ENTITY_STATES, type EntityState } from '../../../features/iam/iam-api';
import {
  listParams,
  listSearch,
  toListSearch,
  type ListSearch,
} from '../../../features/iam/organization/list-search';
import { RoleList } from '../../../features/iam/organization/roles';

/** Only non-sensitive list state is kept in the address (IAM-R08C D-02). */
export const Route = createFileRoute('/_app/roles/')({
  validateSearch: (search: Record<string, unknown>): ListSearch<EntityState> =>
    listSearch(search, ENTITY_STATES),
  component: RolesPage,
});

function RolesPage() {
  // Applied again to what is read: the router can expose raw address parameters.
  const params = listParams(listSearch(Route.useSearch(), ENTITY_STATES));
  const navigate = Route.useNavigate();
  return (
    <RoleList
      params={params}
      onParamsChange={(next) => void navigate({ search: toListSearch(next) })}
    />
  );
}
