import { useParams } from '@tanstack/react-router';
import { LabSectionPage } from './lab-layout';

/** Route component for /dev/ui/$section; keyed so each section starts with fresh state. */
export function LabSection() {
  const { section } = useParams({ from: '/dev/ui/$section' });
  return <LabSectionPage key={section} id={section} />;
}
