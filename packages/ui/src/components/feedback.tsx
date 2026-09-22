import { useEffect, useId, useState, type ReactNode } from 'react';
import { Icon, type IconName } from '../icons/icon';
import { useUiMessages } from '../runtime/ui-root';
import { Button, IconButton } from './button';
import { Spinner } from './spinner';

/** The five shared presentation tones (§9.3, §33). Domain states map onto these outside. */
export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export const TONE_ICONS: Readonly<Record<Tone, IconName>> = {
  neutral: 'minus-circle',
  info: 'info',
  success: 'check-circle',
  warning: 'alert-triangle',
  danger: 'alert-circle',
};

/** Short classification; not an action and not a status with meaning of its own (§27). */
export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className="vx-badge" data-tone={tone}>
      {children}
    </span>
  );
}

export interface StatusIndicatorProps {
  readonly tone: Tone;
  /** The domain's localized label for the state; colour is never the only cue. */
  readonly label: ReactNode;
  /** Shape cue from the domain mapping (§33); defaults to the tone's icon. */
  readonly icon?: IconName;
}

export function StatusIndicator({ tone, label, icon }: StatusIndicatorProps) {
  return (
    <span className="vx-status" data-tone={tone}>
      <Icon name={icon ?? TONE_ICONS[tone]} size="small" />
      <span>{label}</span>
    </span>
  );
}

/** Containment only: no hover, pointer cursor or elevation (§27). */
export function Surface({
  children,
  padding = 'default',
}: {
  children: ReactNode;
  padding?: 'default' | 'none';
}) {
  return (
    <div className="vx-surface" data-padding={padding}>
      {children}
    </div>
  );
}

export interface AlertProps {
  readonly tone: Tone;
  readonly title: ReactNode;
  readonly children?: ReactNode;
  /** Section alerts sit at the affected form/section start; page banners sit below the header. */
  readonly placement?: 'section' | 'page';
  /**
   * Announce once when shown: danger uses an assertive alert, other tones a polite status.
   * Leave off for alerts present at initial render that are not news.
   */
  readonly announce?: boolean;
  readonly actions?: ReactNode;
  /** Offer dismissal only when it is safe to hide the information. */
  readonly onDismiss?: () => void;
}

export function Alert({
  tone,
  title,
  children,
  placement = 'section',
  announce = false,
  actions,
  onDismiss,
}: AlertProps) {
  const messages = useUiMessages();
  const titleId = useId();
  const role = announce ? (tone === 'danger' ? 'alert' : 'status') : undefined;
  return (
    <section
      className="vx-alert"
      data-tone={tone}
      data-placement={placement}
      aria-labelledby={titleId}
    >
      <Icon name={TONE_ICONS[tone]} />
      <div className="vx-alert-content" role={role}>
        <p id={titleId} className="vx-alert-title">
          {title}
        </p>
        {children && <div className="vx-alert-body">{children}</div>}
        {actions && <div className="vx-alert-actions">{actions}</div>}
      </div>
      {onDismiss && (
        <IconButton icon="close" size="small" label={messages.close} onClick={onDismiss} />
      )}
    </section>
  );
}

/** Beside the relevant field or action; persists while relevant (§32). */
export function InlineMessage({
  tone,
  children,
  announce = false,
}: {
  tone: Tone;
  children: ReactNode;
  announce?: boolean;
}) {
  return (
    <p className="vx-inline-message" data-tone={tone} role={announce ? 'status' : undefined}>
      <Icon name={TONE_ICONS[tone]} size="small" />
      <span>{children}</span>
    </p>
  );
}

export interface ProgressProps {
  readonly label: string;
  /** Omit for indeterminate work; never invent a percentage (§34). */
  readonly value?: number;
  readonly max?: number;
  /** Localized value text such as "3 of 8 files"; defaults to a percentage. */
  readonly valueText?: string;
}

/** After this long, indeterminate work states that it is still pending (§34). */
export const LONG_OPERATION_MS = 10_000;

function IndeterminateProgress({ label }: { label: string }) {
  const messages = useUiMessages();
  const [long, setLong] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setLong(true), LONG_OPERATION_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className="vx-progress" role="status">
      <Spinner />
      <span>{label}</span>
      {long && <span className="vx-progress-note">{messages.stillWorking}</span>}
    </div>
  );
}

/** Progress within the affected operation; fills from inline-start (§24.1). */
export function Progress({ label, value, max = 100, valueText }: ProgressProps) {
  const messages = useUiMessages();
  const labelId = useId();
  if (value === undefined) return <IndeterminateProgress label={label} />;
  const clamped = Math.min(Math.max(value, 0), max);
  const text = valueText ?? messages.percentFormat(clamped / max);
  return (
    <div className="vx-progress" data-determinate="">
      <div className="vx-progress-heading">
        <span id={labelId}>{label}</span>
        <span className="vx-numeric">{text}</span>
      </div>
      <div
        className="vx-progress-track"
        role="progressbar"
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={clamped}
        aria-valuetext={text}
      >
        <div className="vx-progress-value" style={{ inlineSize: `${(clamped / max) * 100}%` }} />
      </div>
    </div>
  );
}

/** Shaped placeholders; hidden from assistive technology (§34). */
export function Skeleton({ lines = 3, shape = 'row' }: { lines?: number; shape?: 'row' | 'text' }) {
  return (
    <div className="vx-skeleton" data-shape={shape} aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <span key={index} />
      ))}
    </div>
  );
}

/** Shows nothing for 150ms, then a skeleton; a single message names the loading region (§34). */
export const SKELETON_DELAY_MS = 150;

export function LoadingState({ label, lines = 3 }: { label: string; lines?: number }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), SKELETON_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className="vx-loading" aria-busy="true">
      <p className="vx-visually-hidden" role="status">
        {label}
      </p>
      {visible && <Skeleton lines={lines} />}
    </div>
  );
}

export interface EmptyStateProps {
  readonly title: string;
  readonly description: ReactNode;
  /** One permitted first action, if the viewer may take it. */
  readonly action?: ReactNode;
  readonly icon?: IconName;
  readonly headingLevel?: 2 | 3;
}

export function EmptyState({
  title,
  description,
  action,
  icon = 'file',
  headingLevel = 2,
}: EmptyStateProps) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <div className="vx-empty">
      <Icon name={icon} size="empty" />
      <Heading className="vx-empty-title">{title}</Heading>
      <p className="vx-empty-description">{description}</p>
      {action && <div className="vx-empty-action">{action}</div>}
    </div>
  );
}

/** Filters matched nothing: keep the query, offer to clear it (§34). */
export function NoResultsState({
  onClearFilters,
  headingLevel = 2,
}: {
  onClearFilters: () => void;
  headingLevel?: 2 | 3;
}) {
  const messages = useUiMessages();
  return (
    <EmptyState
      icon="search"
      headingLevel={headingLevel}
      title={messages.noResultsTitle}
      description={messages.noResultsDescription}
      action={<Button onClick={onClearFilters}>{messages.clearFilters}</Button>}
    />
  );
}

export interface ErrorStateProps {
  readonly title: string;
  /** What could not load and the safe next step; never implementation detail. */
  readonly description: ReactNode;
  /** Safe read retry only; mutation retry is never inferred here (§34). */
  readonly onRetry?: () => void;
  readonly retrying?: boolean;
  /** A safe support reference, when one exists. */
  readonly reference?: string;
  readonly headingLevel?: 2 | 3;
}

export function ErrorState({
  title,
  description,
  onRetry,
  retrying = false,
  reference,
  headingLevel = 2,
}: ErrorStateProps) {
  const messages = useUiMessages();
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <div className="vx-empty" data-tone="danger">
      <Icon name="alert-circle" size="empty" />
      <div role="alert">
        <Heading className="vx-empty-title">{title}</Heading>
        <p className="vx-empty-description">{description}</p>
      </div>
      {reference && (
        <p className="vx-empty-description">
          <bdi className="vx-code" dir="ltr">
            {reference}
          </bdi>
        </p>
      )}
      {onRetry && (
        <div className="vx-empty-action">
          <Button
            icon="refresh"
            pending={retrying}
            pendingLabel={messages.loading}
            onClick={onRetry}
          >
            {messages.retry}
          </Button>
        </div>
      )}
    </div>
  );
}
