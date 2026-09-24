import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { RoleDetailPage } from '../../../features/iam/organization/roles';

export interface CreatedSearch {
  /** Set once by the create flow, then removed from the address. */
  readonly created?: true | undefined;
}

export const Route = createFileRoute('/_app/roles/$roleId')({
  validateSearch: (search: Record<string, unknown>): CreatedSearch =>
    search['created'] === true ? { created: true } : {},
  component: RolePage,
});

function RolePage() {
  const { roleId } = Route.useParams();
  const { created } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [justCreated] = useState(created === true);
  useEffect(() => {
    if (created) void navigate({ search: {}, replace: true });
  }, [created, navigate]);
  // A different role is a different page: its dialogs and outcomes never carry over.
  return <RoleDetailPage key={roleId} roleId={roleId} created={justCreated} />;
}
