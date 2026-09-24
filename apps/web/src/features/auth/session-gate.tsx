import { useQuery } from '@tanstack/react-query';
import { ErrorState, LoadingState, Page, PageHeader } from '@vertex-os/ui';
import type { ReactNode } from 'react';
import { useAuthMessages } from './auth-messages';
import { authQuery } from './auth-state';
import { SignedOutPage, type SignInFailure } from './signed-out-page';

export interface SessionGateProps {
  readonly authError?: SignInFailure | undefined;
  readonly children: ReactNode;
}

/**
 * Renders protected content only for a signed-in session (IAM-R08 D-05). Signed out, expired,
 * ended and inactive lead to the sign-in page; a failure to check the session is an error with a
 * retry, never "signed out". A failed background refresh keeps the signed-in content.
 */
export function SessionGate({ authError, children }: SessionGateProps) {
  const messages = useAuthMessages();
  const auth = useQuery(authQuery);

  if (auth.data === undefined) {
    return (
      <Page width="reading">
        <PageHeader title="Vertex OS" />
        {auth.isError ? (
          <ErrorState
            title={messages.unavailableTitle}
            description={messages.unavailableDetail}
            onRetry={() => void auth.refetch()}
            retrying={auth.isFetching}
          />
        ) : (
          <LoadingState label={messages.loadingSession} />
        )}
      </Page>
    );
  }
  if (auth.data.status === 'signed-in') return children;
  return (
    <SignedOutPage
      reason={auth.data.status === 'inactive' ? 'inactive' : auth.data.reason}
      authError={authError}
    />
  );
}
