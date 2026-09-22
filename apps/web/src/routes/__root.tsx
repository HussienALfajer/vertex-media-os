import { createRootRoute, Outlet, useRouter } from '@tanstack/react-router';
import { Button, focusPageHeading, Page, PageHeader, UiRoot } from '@vertex-os/ui';
import { useEffect } from 'react';
import { useAppMessages } from '../app-messages';
import { ApplicationShell } from '../app-shell';
import { RouterLink } from '../lib/router-link';

export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFound,
});

function RootLayout() {
  return (
    <UiRoot linkComponent={RouterLink}>
      <RouteFocus />
      <Outlet />
    </UiRoot>
  );
}

/** After client-side navigation, focus and thereby announce the new page heading (§20). */
function RouteFocus() {
  const router = useRouter();
  useEffect(
    () =>
      router.subscribe('onResolved', (event) => {
        if (event.pathChanged && event.fromLocation !== undefined)
          requestAnimationFrame(focusPageHeading);
      }),
    [router],
  );
  return null;
}

function NotFound() {
  const messages = useAppMessages();
  const router = useRouter();
  return (
    <ApplicationShell>
      <Page width="reading">
        <PageHeader
          title={messages.notFoundTitle}
          description={messages.notFoundDescription}
          actions={
            <Button variant="primary" icon="home" onClick={() => void router.navigate({ to: '/' })}>
              {messages.backHome}
            </Button>
          }
        />
      </Page>
    </ApplicationShell>
  );
}
