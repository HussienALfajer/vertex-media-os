import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { UserDetailPage } from '../../../features/iam/users/user-detail';

export interface UserSearch {
  /** Set once by the create flow, then removed from the address (IAM-R08B D-10). */
  readonly created?: true | undefined;
}

export const Route = createFileRoute('/_app/users/$userId')({
  validateSearch: (search: Record<string, unknown>): UserSearch =>
    search['created'] === true ? { created: true } : {},
  component: UserPage,
});

function UserPage() {
  const { userId } = Route.useParams();
  const { created } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [justCreated] = useState(created === true);
  useEffect(() => {
    if (created) void navigate({ search: {}, replace: true });
  }, [created, navigate]);
  // A different user is a different page: its dialogs and outcomes never carry over.
  return <UserDetailPage key={userId} userId={userId} created={justCreated} />;
}
