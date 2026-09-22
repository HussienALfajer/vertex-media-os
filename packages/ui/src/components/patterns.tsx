import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useUiMessages, useUiSettings } from '../runtime/ui-root';
import type { Density, Language, ThemePreference } from '../runtime/settings';
import { IconButton } from './button';
import { Radio } from './choice';
import { Fieldset } from './field';
import { Popover } from './overlays';

export type PageWidth = 'full' | 'detail' | 'form' | 'reading';

/** Page frame applying the §22.2 width for its pattern and the page rhythm. */
export function Page({ width = 'full', children }: { width?: PageWidth; children: ReactNode }) {
  return (
    <div className="vx-page" data-width={width}>
      {children}
    </div>
  );
}

export interface PageHeaderProps {
  /** Optional breadcrumb, above the title. */
  readonly breadcrumb?: ReactNode;
  /** The page's single h1; focused after route navigation. */
  readonly title: ReactNode;
  readonly description?: ReactNode;
  /** One prominent primary action per work context; tertiary actions in a named menu. */
  readonly actions?: ReactNode;
  /**
   * Semantic level, independent of the page-title type role (§12.2). Pages keep the default
   * single h1; only a header embedded in another page's outline (for example a specimen)
   * uses a lower level, and it is then not the route-focus target.
   */
  readonly headingLevel?: 1 | 2 | 3;
}

/** Breadcrumb → title/context/actions (§22.2). Title at inline-start, actions at inline-end. */
export function PageHeader({
  breadcrumb,
  title,
  description,
  actions,
  headingLevel = 1,
}: PageHeaderProps) {
  const Heading = (['h1', 'h2', 'h3'] as const)[headingLevel - 1] ?? 'h1';
  const page = headingLevel === 1;
  return (
    <header className="vx-page-header">
      {breadcrumb}
      <div className="vx-page-header-row">
        <div className="vx-page-header-text">
          <Heading
            className="vx-page-title"
            tabIndex={page ? -1 : undefined}
            data-vx-page-heading={page ? '' : undefined}
          >
            {title}
          </Heading>
          {description && <p className="vx-page-description">{description}</p>}
        </div>
        {actions && <div className="vx-page-header-actions">{actions}</div>}
      </div>
    </header>
  );
}

export interface RecordHeaderProps extends PageHeaderProps {
  /** Stable record identifier, usually a TechnicalId. */
  readonly identifier?: ReactNode;
  /** Separately labelled facts such as status indicators; never merged into one colour. */
  readonly statuses?: ReactNode;
  readonly metadata?: ReactNode;
}

/** Detail view heading: identity, status and owner first (§22.2). */
export function RecordHeader({ identifier, statuses, metadata, ...header }: RecordHeaderProps) {
  return (
    <div className="vx-record-header">
      <PageHeader {...header} />
      {(identifier || statuses) && (
        <div className="vx-record-header-facts">
          {identifier}
          {statuses}
        </div>
      )}
      {metadata}
    </div>
  );
}

/** Focuses the page heading after route navigation (§20); call from the router integration. */
export function focusPageHeading(): void {
  const heading = document.querySelector<HTMLElement>('[data-vx-page-heading]');
  (heading ?? document.querySelector<HTMLElement>('[data-vx-focus-fallback]'))?.focus({
    preventScroll: false,
  });
}

export function FormSection({
  title,
  description,
  headingLevel = 2,
  children,
}: {
  title: string;
  description?: ReactNode;
  headingLevel?: 2 | 3;
  children: ReactNode;
}) {
  const id = useId();
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <section className="vx-form-section" aria-labelledby={id}>
      <div className="vx-form-section-heading">
        <Heading id={id} className="vx-form-section-title">
          {title}
        </Heading>
        {description && <p className="vx-form-section-description">{description}</p>}
      </div>
      <div className="vx-form-section-fields">{children}</div>
    </section>
  );
}

/** States once, at form start, that * marks required fields (§28.1). */
export function RequiredNote() {
  return <p className="vx-required-note">{useUiMessages().requiredNote}</p>;
}

/**
 * Commit area: secondary before primary in DOM, so the primary sits at inline-end and, when
 * wrapped, the commit action stays at block-end (§23, §28.4).
 */
export function FormActions({ children }: { children: ReactNode }) {
  return <div className="vx-form-actions">{children}</div>;
}

export interface FormIssue {
  /** Id of the field control to focus; omit for a form-level issue. */
  readonly fieldId?: string;
  readonly message: string;
}

/**
 * Error summary at the form start (§28.3). On each failed submission (`attempt` changes) it
 * takes focus when there are several or form-level issues; a single field issue focuses that
 * field instead. Links move focus to the field.
 */
export function ErrorSummary({
  issues,
  attempt,
}: {
  issues: readonly FormIssue[];
  attempt: number;
}) {
  const messages = useUiMessages();
  const summary = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const latest = useRef(issues);
  useEffect(() => {
    latest.current = issues;
  }, [issues]);
  useEffect(() => {
    const current = latest.current;
    if (attempt === 0 || current.length === 0) return;
    const only = current[0];
    if (current.length === 1 && only?.fieldId) document.getElementById(only.fieldId)?.focus();
    else summary.current?.focus();
  }, [attempt]);
  if (issues.length === 0) return null;
  return (
    <div ref={summary} className="vx-error-summary" tabIndex={-1} aria-labelledby={titleId}>
      <p id={titleId} className="vx-error-summary-title">
        {messages.errorSummaryTitle(issues.length)}
      </p>
      <ul>
        {issues.map((issue, index) => (
          <li key={issue.fieldId ?? `form-${index}`}>
            {issue.fieldId ? (
              <a
                href={`#${issue.fieldId}`}
                onClick={(event) => {
                  event.preventDefault();
                  document.getElementById(issue.fieldId ?? '')?.focus();
                }}
              >
                {issue.message}
              </a>
            ) : (
              issue.message
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface DescriptionItem {
  readonly term: ReactNode;
  readonly details: ReactNode;
}

/** Key/value facts as a real description list (§27). */
export function DescriptionList({ items }: { items: readonly DescriptionItem[] }) {
  return (
    <dl className="vx-description-list">
      {items.map((item, index) => (
        <div key={index} className="vx-description-item">
          <dt>{item.term}</dt>
          <dd>{item.details}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Nonmodal complementary panel at inline-end (§22.2): 360px, 320–480px, separator and no
 * shadow. It never traps focus; on narrow screens the feature presents a route or Drawer.
 */
export function Inspector({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose?: () => void;
  children: ReactNode;
}) {
  const messages = useUiMessages();
  const id = useId();
  return (
    <aside className="vx-inspector" aria-labelledby={id}>
      <div className="vx-inspector-header">
        <h2 id={id} className="vx-inspector-title">
          {title}
        </h2>
        {onClose && (
          <IconButton icon="close" size="small" label={messages.close} onClick={onClose} />
        )}
      </div>
      <div className="vx-inspector-body">{children}</div>
    </aside>
  );
}

/** Primary content with an optional inspector that stacks when the primary would fall below 560px. */
export function InspectorLayout({
  inspector,
  children,
}: {
  inspector?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="vx-inspector-layout">
      <div className="vx-inspector-layout-content" data-open={inspector ? '' : undefined}>
        <div className="vx-inspector-layout-main">{children}</div>
        {inspector}
      </div>
    </div>
  );
}

/** Language, theme and density: the only persisted, non-sensitive UI preferences (§40.1). */
export function DisplayPreferences() {
  const messages = useUiMessages();
  const settings = useUiSettings();
  const languages: readonly [Language, string][] = [
    ['ar', 'العربية'],
    ['en', 'English'],
  ];
  const themes: readonly [ThemePreference, string][] = [
    ['system', messages.themeSystem],
    ['light', messages.themeLight],
    ['dark', messages.themeDark],
  ];
  const densities: readonly [Density, string][] = [
    ['default', messages.densityDefault],
    ['compact', messages.densityCompact],
  ];
  return (
    <Popover
      title={messages.displayPreferences}
      trigger={<IconButton icon="sliders" label={messages.displayPreferences} />}
    >
      <div className="vx-preferences">
        <Fieldset legend={messages.language}>
          {languages.map(([value, label]) => (
            <Radio
              key={value}
              name="vx-language"
              value={value}
              lang={value}
              label={label}
              checked={settings.language === value}
              onChange={() => settings.setPreferences({ language: value })}
            />
          ))}
        </Fieldset>
        <Fieldset legend={messages.theme}>
          {themes.map(([value, label]) => (
            <Radio
              key={value}
              name="vx-theme"
              value={value}
              label={label}
              checked={settings.theme === value}
              onChange={() => settings.setPreferences({ theme: value })}
            />
          ))}
        </Fieldset>
        <Fieldset
          legend={messages.density}
          description={settings.coarsePointer ? messages.densityCoarseNote : undefined}
        >
          {densities.map(([value, label]) => (
            <Radio
              key={value}
              name="vx-density"
              value={value}
              label={label}
              checked={settings.density === value}
              onChange={() => settings.setPreferences({ density: value })}
            />
          ))}
        </Fieldset>
      </div>
    </Popover>
  );
}
