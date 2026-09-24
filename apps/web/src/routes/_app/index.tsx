import { createFileRoute } from '@tanstack/react-router';
import { Page, PageHeader } from '@vertex-os/ui';
import { useAppMessages } from '../../app-messages';
import { ApiStatus } from '../../features/system-status/api-status';

export const Route = createFileRoute('/_app/')({
  component: HomePage,
});

function HomePage() {
  const messages = useAppMessages();
  return (
    <Page width="detail">
      <PageHeader title="Vertex OS" description={messages.productDescription} />
      <ApiStatus />
    </Page>
  );
}
