import { createFileRoute } from '@tanstack/react-router';
import { LabSection } from '#design-lab';

export const Route = createFileRoute('/dev/ui/$section')({
  component: LabSection,
});
