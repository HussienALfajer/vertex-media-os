import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { ApplicationShell } from '../../app-shell';
import { SessionGate } from '../../features/auth/session-gate';
import { isSignInFailure, type SignInFailure } from '../../features/auth/signed-out-page';

export interface AppSearch {
  /** Set by the API's sign-in callback when sign-in failed (IAM-R08 D-08). */
  readonly authError?: SignInFailure | undefined;
}

/** The application area: every route below it needs a signed-in session (IAM-R08 D-12). */
export const Route = createFileRoute('/_app')({
  validateSearch: (search: Record<string, unknown>): AppSearch =>
    isSignInFailure(search['authError']) ? { authError: search['authError'] } : {},
  component: ApplicationLayout,
});

function ApplicationLayout() {
  const { authError } = Route.useSearch();
  const navigate = useNavigate();
  // Shown once, then removed from the address so a reload or a shared link does not repeat it.
  const [signInFailure] = useState(authError);
  useEffect(() => {
    if (authError !== undefined) {
      void navigate({ to: '.', search: ({ authError: _removed, ...rest }) => rest, replace: true });
    }
  }, [authError, navigate]);

  return (
    <ApplicationShell>
      <SessionGate authError={signInFailure}>
        <Outlet />
      </SessionGate>
    </ApplicationShell>
  );
}
