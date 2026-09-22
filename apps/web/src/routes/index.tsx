import { createFileRoute } from '@tanstack/react-router';
import { Page, PageHeader } from '@vertex-os/ui';
import { useAppMessages } from '../app-messages';
import { ApplicationShell } from '../app-shell';
import { ApiStatus } from '../features/system-status/api-status';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage() {
  const messages = useAppMessages();
  return (
    <ApplicationShell>
      <Page width="detail">
        <PageHeader title="Vertex OS" description={messages.productDescription} />
        <ApiStatus />
      </Page>
    </ApplicationShell>
  );
}
