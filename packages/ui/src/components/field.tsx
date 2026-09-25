import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentPropsWithRef,
  type ReactNode,
} from 'react';
import { Icon } from '../icons/icon';
import { useUiMessages } from '../runtime/ui-root';
import { IconButton } from './button';

interface FieldState {
  readonly controlId: string;
  readonly describedBy: string | undefined;
  readonly invalid: boolean;
  readonly required: boolean;
}

const FieldContext = createContext<FieldState | null>(null);

/** Attributes a control receives from its enclosing Field. */
function useFieldControl() {
  const field = useContext(FieldContext);
  if (!field) return {};
  return {
    id: field.controlId,
    'aria-describedby': field.describedBy,
    'aria-invalid': field.invalid || undefined,
    required: field.required || undefined,
  };
}

function RequirementMark({ required, optional }: { required: boolean; optional: boolean }) {
  const messages = useUiMessages();
  if (required)
    // Decorative: `required` is exposed programmatically; the form explains the mark once.
    return (
      <span className="vx-field-mark" aria-hidden="true">
        *
      </span>
    );
  // The literal space keeps "label (optional)" as separate words in the accessible name.
  if (optional)
    return (
      <>
        {' '}
        <span className="vx-field-optional">({messages.optional})</span>
      </>
    );
  return null;
}

export function ErrorMessage({ id, children }: { id?: string | undefined; children: ReactNode }) {
  return (
    <p id={id} className="vx-field-error">
      <Icon name="alert-circle" size="small" />
      <span>{children}</span>
    </p>
  );
}

export interface FieldProps {
  readonly label: ReactNode;
  readonly description?: ReactNode;
  /** Present only while invalid; rendered after the description and linked to the control. */
  readonly error?: ReactNode;
  readonly required?: boolean;
  /** Mark optional only where mixed requirements would otherwise be unclear (§28.1). */
  readonly optional?: boolean;
  /** Stable control id, for error-summary links. Generated when omitted. */
  readonly id?: string;
  readonly children: ReactNode;
}

/** Label above, control, help, then error — one stable control id with programmatic links. */
export function Field({
  label,
  description,
  error,
  required = false,
  optional = false,
  id,
  children,
}: FieldProps) {
  const generated = useId();
  const controlId = id ?? `field-${generated}`;
  const descriptionId = description ? `${controlId}-description` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <FieldContext value={{ controlId, describedBy, invalid: Boolean(error), required }}>
      <div className="vx-field" data-invalid={error ? '' : undefined}>
        <label className="vx-label" htmlFor={controlId}>
          {label}
          <RequirementMark required={required} optional={optional && !required} />
        </label>
        {children}
        {description && (
          <p id={descriptionId} className="vx-field-description">
            {description}
          </p>
        )}
        {error && <ErrorMessage id={errorId}>{error}</ErrorMessage>}
      </div>
    </FieldContext>
  );
}

export interface FieldsetProps {
  readonly legend: ReactNode;
  readonly description?: ReactNode;
  readonly error?: ReactNode;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly children: ReactNode;
}

/**
 * A real fieldset/legend for choice groups (§28.1). A group has no native required state
 * (and `aria-required` is not allowed on its group role), so a required group states it in
 * the legend's accessible name; the visible `*` stays decorative.
 */
export function Fieldset({
  legend,
  description,
  error,
  required = false,
  disabled,
  children,
}: FieldsetProps) {
  const messages = useUiMessages();
  const id = useId();
  const describedBy =
    [description ? `${id}-description` : null, error ? `${id}-error` : null]
      .filter(Boolean)
      .join(' ') || undefined;
  return (
    <fieldset
      className="vx-fieldset"
      disabled={disabled}
      aria-describedby={describedBy}
      aria-invalid={error ? true : undefined}
    >
      <legend className="vx-label">
        {legend}
        <RequirementMark required={required} optional={false} />
        {required && (
          <>
            {' '}
            <span className="vx-visually-hidden">({messages.required})</span>
          </>
        )}
      </legend>
      {description && (
        <p id={`${id}-description`} className="vx-field-description">
          {description}
        </p>
      )}
      <div className="vx-fieldset-options">{children}</div>
      {error && <ErrorMessage id={`${id}-error`}>{error}</ErrorMessage>}
    </fieldset>
  );
}

type TextValue =
  | {
      readonly value: string;
      readonly onChange: (event: ChangeEvent<HTMLInputElement>) => void;
      readonly defaultValue?: never;
    }
  | {
      readonly value?: never;
      readonly onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
      readonly defaultValue?: string;
    };

export type InputType = 'text' | 'email' | 'password' | 'url' | 'tel' | 'search';

export type InputProps = Omit<
  ComponentPropsWithRef<'input'>,
  'className' | 'style' | 'type' | 'value' | 'defaultValue' | 'onChange' | 'size' | 'children'
> &
  TextValue & { readonly type?: InputType };

/** Known left-to-right values keep LTR direction inside an RTL form (§24.3). */
const LTR_TYPES = new Set<InputType>(['email', 'url', 'tel']);

export function Input({ type = 'text', dir, ...props }: InputProps) {
  const field = useFieldControl();
  return (
    <input
      {...props}
      {...field}
      type={type}
      dir={dir ?? (LTR_TYPES.has(type) ? 'ltr' : undefined)}
      className="vx-input"
    />
  );
}

export type TextareaProps = Omit<ComponentPropsWithRef<'textarea'>, 'className' | 'style'>;

export function Textarea(props: TextareaProps) {
  const field = useFieldControl();
  return <textarea {...props} {...field} className="vx-input" data-multiline="" />;
}

export type SelectProps = Omit<
  ComponentPropsWithRef<'select'>,
  'className' | 'style' | 'multiple' | 'size'
>;

/** Native single choice for short fixed option sets (§28.2). */
export function Select(props: SelectProps) {
  const field = useFieldControl();
  return (
    <span className="vx-select">
      <select {...props} {...field} className="vx-input" />
      <Icon name="chevron-down" />
    </span>
  );
}

/** Interaction timing, not motion (§29.2). */
export const SEARCH_DEBOUNCE_MS = 300;

export interface SearchInputProps extends Omit<
  InputProps,
  'type' | 'value' | 'defaultValue' | 'onChange'
> {
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  /** Receives the committed query: after 300ms of settled typing, on Enter, or on clear. */
  readonly onSearch: (query: string) => void;
}

/**
 * Search field inside a Field: respects IME composition, commits immediately on Enter,
 * clears without submitting any form, and keeps focus in the field (§27, §29.2).
 */
export function SearchInput({
  value,
  onValueChange,
  onSearch,
  onKeyDown,
  ...props
}: SearchInputProps) {
  const messages = useUiMessages();
  const [composing, setComposing] = useState(false);
  const committed = useRef(value);
  const latest = useRef(onSearch);
  const input = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    latest.current = onSearch;
  }, [onSearch]);
  const commit = (query: string) => {
    if (committed.current === query) return;
    committed.current = query;
    latest.current(query);
  };
  useEffect(() => {
    if (composing || value === committed.current) return undefined;
    const timer = setTimeout(() => commit(value), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value, composing]);
  return (
    <span className="vx-search">
      <Icon name="search" />
      <Input
        {...props}
        ref={input}
        type="search"
        value={value}
        onChange={(event) => onValueChange(event.currentTarget.value)}
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={(event) => {
          setComposing(false);
          onValueChange(event.currentTarget.value);
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.key !== 'Enter' || composing || event.nativeEvent.isComposing) return;
          // Enter searches now and never submits an enclosing form.
          event.preventDefault();
          commit(value);
        }}
      />
      {value !== '' && (
        <IconButton
          icon="close"
          size="small"
          label={messages.clearSearch}
          onClick={() => {
            onValueChange('');
            commit('');
            input.current?.focus();
          }}
        />
      )}
    </span>
  );
}
