import { createFileRoute, notFound } from '@tanstack/react-router';
import { LabLayout } from '#design-lab';

/**
 * The design-system lab exists only in development and in the explicit `lab` build
 * (DS-D026). Production resolves `#design-lab` to an empty stand-in and this route to
 * not-found, so no lab module is shipped.
 */
const LAB_BUILD = import.meta.env.DEV || import.meta.env.MODE === 'lab';

export const Route = createFileRoute('/dev/ui')({
  beforeLoad: () => {
    if (!LAB_BUILD) throw notFound();
  },
  component: LabLayout,
});
