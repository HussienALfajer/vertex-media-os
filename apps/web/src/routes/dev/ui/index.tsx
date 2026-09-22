import { createFileRoute } from '@tanstack/react-router';
import { LabOverview } from '#design-lab';

export const Route = createFileRoute('/dev/ui/')({
  component: LabOverview,
});
