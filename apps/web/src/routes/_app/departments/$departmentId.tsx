import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { DepartmentDetailPage } from '../../../features/iam/organization/departments';

export interface CreatedSearch {
  /** Set once by the create flow, then removed from the address. */
  readonly created?: true | undefined;
}

export const Route = createFileRoute('/_app/departments/$departmentId')({
  validateSearch: (search: Record<string, unknown>): CreatedSearch =>
    search['created'] === true ? { created: true } : {},
  component: DepartmentPage,
});

function DepartmentPage() {
  const { departmentId } = Route.useParams();
  const { created } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [justCreated] = useState(created === true);
  useEffect(() => {
    if (created) void navigate({ search: {}, replace: true });
  }, [created, navigate]);
  // A different department is a different page: its dialogs and outcomes never carry over.
  return (
    <DepartmentDetailPage key={departmentId} departmentId={departmentId} created={justCreated} />
  );
}
