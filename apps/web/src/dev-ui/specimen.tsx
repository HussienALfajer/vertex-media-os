import { Surface } from '@vertex-os/ui';
import { useId, type ReactNode } from 'react';

/**
 * One inspectable specimen: a titled, labelled region. `id` is stable so browser tests and
 * visual baselines can address it without depending on markup structure.
 */
export function Specimen({
  id,
  title,
  description,
  children,
  flush = false,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
  /** Content that brings its own frame (tables, shells) skips the surface. */
  flush?: boolean;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} data-specimen={id} className="flex flex-col gap-actions">
      <div className="flex flex-col gap-field-gap">
        <h2 id={headingId} className="type-section-title">
          {title}
        </h2>
        {description && <p className="type-secondary text-secondary">{description}</p>}
      </div>
      {flush ? children : <Surface>{children}</Surface>}
    </section>
  );
}

/** Wrapping row of specimen items with the shared action rhythm. */
export function Row({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-actions">{children}</div>;
}

/** Vertical stack used inside specimens. */
export function Stack({
  children,
  gap = 'form-fields',
}: {
  children: ReactNode;
  gap?: 'actions' | 'form-fields' | 'section';
}) {
  const spacing = {
    actions: 'gap-actions',
    'form-fields': 'gap-form-fields',
    section: 'gap-section',
  }[gap];
  return <div className={`flex flex-col ${spacing}`}>{children}</div>;
}

/** Small caption naming what a specimen item demonstrates. */
export function Caption({ children }: { children: ReactNode }) {
  return <p className="type-secondary text-secondary">{children}</p>;
}
