import { createFileRoute } from '@tanstack/react-router';
import { ENTITY_STATES, type EntityState } from '../../../features/iam/iam-api';
import { DepartmentList } from '../../../features/iam/organization/departments';
import {
  listParams,
  listSearch,
  toListSearch,
  type ListSearch,
} from '../../../features/iam/organization/list-search';

/** Only non-sensitive list state is kept in the address (IAM-R08C D-02). */
export const Route = createFileRoute('/_app/departments/')({
  validateSearch: (search: Record<string, unknown>): ListSearch<EntityState> =>
    listSearch(search, ENTITY_STATES),
  component: DepartmentsPage,
});

function DepartmentsPage() {
  // Applied again to what is read: the router can expose raw address parameters.
  const params = listParams(listSearch(Route.useSearch(), ENTITY_STATES));
  const navigate = Route.useNavigate();
  return (
    <DepartmentList
      params={params}
      onParamsChange={(next) => void navigate({ search: toListSearch(next) })}
    />
  );
}
