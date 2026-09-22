import {
  useId,
  useLayoutEffect,
  useRef,
  type ChangeEvent,
  type ComponentPropsWithRef,
  type ReactNode,
  type Ref,
} from 'react';
import { Icon } from '../icons/icon';
import { Spinner } from './spinner';

type CheckedState =
  | {
      readonly checked: boolean;
      readonly onChange: (event: ChangeEvent<HTMLInputElement>) => void;
      readonly defaultChecked?: never;
    }
  | {
      readonly checked?: never;
      readonly onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
      readonly defaultChecked?: boolean;
    };

type ChoiceProps = Omit<
  ComponentPropsWithRef<'input'>,
  'className' | 'style' | 'type' | 'checked' | 'defaultChecked' | 'onChange' | 'children' | 'role'
> &
  CheckedState & {
    /** Visible label; with the control it forms the hit area (§14). */
    readonly label: ReactNode;
    /** Supporting text, announced as a description, never as part of the name. */
    readonly description?: ReactNode;
  };

function mergeRefs<T>(...refs: (Ref<T> | undefined)[]) {
  return (node: T | null) => {
    for (const ref of refs) {
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    }
  };
}

/**
 * Shared anatomy: [control][label] with the description below the label. The label is
 * associated explicitly so the description stays out of the accessible name.
 */
function ChoiceFrame({
  kind,
  inputId,
  descriptionId,
  label,
  description,
  pending,
  control,
}: {
  kind: 'checkbox' | 'radio' | 'switch';
  inputId: string;
  descriptionId: string;
  label: ReactNode;
  description: ReactNode;
  pending?: boolean;
  control: ReactNode;
}) {
  return (
    <div className="vx-choice" data-kind={kind} data-pending={pending ? '' : undefined}>
      <span className="vx-choice-control">{control}</span>
      <label className="vx-choice-label" htmlFor={inputId}>
        {label}
      </label>
      {description && (
        <span id={descriptionId} className="vx-choice-description">
          {description}
        </span>
      )}
    </div>
  );
}

export type CheckboxProps = ChoiceProps & {
  /** Mixed group state (§19): a primary fill with a dash, announced as mixed. */
  readonly mixed?: boolean;
};

/** Independent choice committed with its form (§28.2). */
export function Checkbox({ label, description, mixed = false, ref, id, ...props }: CheckboxProps) {
  const input = useRef<HTMLInputElement | null>(null);
  const generated = useId();
  const inputId = id ?? generated;
  const descriptionId = `${inputId}-description`;
  useLayoutEffect(() => {
    // Native indeterminate exposes the mixed state to assistive technology.
    if (input.current) input.current.indeterminate = mixed;
  }, [mixed]);
  return (
    <ChoiceFrame
      kind="checkbox"
      inputId={inputId}
      descriptionId={descriptionId}
      label={label}
      description={description}
      control={
        <>
          <input
            {...props}
            ref={mergeRefs(input, ref)}
            id={inputId}
            type="checkbox"
            className="vx-choice-input"
            aria-describedby={description ? descriptionId : props['aria-describedby']}
          />
          <span className="vx-choice-glyph" aria-hidden="true">
            <span data-glyph="check">
              <Icon name="check" size="small" />
            </span>
            <span data-glyph="dash">
              <Icon name="dash" size="small" />
            </span>
          </span>
        </>
      }
    />
  );
}

/** One option of an exclusive set; group radios in a Fieldset sharing a `name`. */
export function Radio({
  label,
  description,
  id,
  ...props
}: ChoiceProps & { readonly name: string; readonly value: string }) {
  const generated = useId();
  const inputId = id ?? generated;
  const descriptionId = `${inputId}-description`;
  return (
    <ChoiceFrame
      kind="radio"
      inputId={inputId}
      descriptionId={descriptionId}
      label={label}
      description={description}
      control={
        <>
          <input
            {...props}
            id={inputId}
            type="radio"
            className="vx-choice-input"
            aria-describedby={description ? descriptionId : props['aria-describedby']}
          />
          <span className="vx-choice-glyph" aria-hidden="true">
            <span data-glyph="dot" />
          </span>
        </>
      }
    />
  );
}

export type SwitchProps = ChoiceProps & {
  /**
   * An immediate setting change is in flight: further changes are suppressed and the
   * description should state the pending or failed outcome (§28.2). Never use a switch for
   * security-sensitive access changes.
   */
  readonly pending?: boolean;
};

/** Immediate, reversible setting. Off at inline-start, on at inline-end (§24.1). */
export function Switch({
  label,
  description,
  pending = false,
  onClick,
  onChange,
  id,
  ...props
}: SwitchProps) {
  const generated = useId();
  const inputId = id ?? generated;
  const descriptionId = `${inputId}-description`;
  return (
    <ChoiceFrame
      kind="switch"
      inputId={inputId}
      descriptionId={descriptionId}
      label={label}
      description={description}
      pending={pending}
      control={
        <>
          <input
            {...props}
            id={inputId}
            type="checkbox"
            role="switch"
            className="vx-choice-input"
            aria-disabled={pending || props['aria-disabled']}
            aria-describedby={description ? descriptionId : props['aria-describedby']}
            onClick={(event) => {
              if (pending) event.preventDefault();
              else onClick?.(event);
            }}
            onChange={(event) => {
              if (!pending) onChange?.(event);
            }}
          />
          <span className="vx-switch-thumb" aria-hidden="true">
            {pending && <Spinner />}
          </span>
        </>
      }
    />
  );
}
