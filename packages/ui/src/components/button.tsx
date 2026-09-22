import type { ComponentPropsWithRef, MouseEvent, ReactNode } from 'react';
import { Icon, type IconName } from '../icons/icon';
import { Spinner } from './spinner';
import { Tooltip } from './tooltip';

type NativeButton = Omit<ComponentPropsWithRef<'button'>, 'className' | 'style' | 'children'>;

/**
 * Valid variant/intent combinations only (§26.1): danger is supported by the filled primary
 * and the quiet ghost action. There is no gold/brand variant.
 */
export type ButtonVariant =
  | { readonly variant?: 'secondary'; readonly intent?: 'default' }
  | { readonly variant: 'primary' | 'ghost'; readonly intent?: 'default' | 'danger' };

export type ButtonSize = 'small' | 'medium' | 'large';

interface ActionState {
  readonly size?: ButtonSize;
  /**
   * The action is running: focus stays, the label area keeps its width, activation (including
   * form submission) is suppressed and `pendingLabel` becomes the visible and accessible label.
   */
  readonly pending?: boolean;
  readonly pendingLabel?: string;
}

export type ButtonProps = NativeButton &
  ButtonVariant &
  ActionState & {
    readonly children: ReactNode;
    /** Leading icon; placed at inline-start in both directions. */
    readonly icon?: IconName;
    /** Trailing icon at inline-end, e.g. a directional "next" chevron. */
    readonly trailingIcon?: IconName;
  };

function guard(pending: boolean, onClick: NativeButton['onClick']) {
  return (event: MouseEvent<HTMLButtonElement>) => {
    if (pending) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };
}

export function Button({
  variant = 'secondary',
  intent = 'default',
  size = 'medium',
  pending = false,
  pendingLabel,
  icon,
  trailingIcon,
  children,
  onClick,
  type = 'button',
  ...native
}: ButtonProps) {
  // Both layers share one grid cell, so the button keeps the wider of the two widths.
  const showPendingLayer = pending || pendingLabel !== undefined;
  return (
    <button
      {...native}
      type={type}
      className="vx-button"
      data-variant={variant}
      data-intent={intent}
      data-size={size}
      data-pending={pending ? '' : undefined}
      aria-disabled={pending ? true : native['aria-disabled']}
      onClick={guard(pending, onClick)}
    >
      <span className="vx-button-layers">
        <span
          className="vx-button-layer"
          data-inactive={pending ? '' : undefined}
          aria-hidden={pending || undefined}
        >
          {icon && <Icon name={icon} />}
          <span className="vx-button-text">{children}</span>
          {trailingIcon && <Icon name={trailingIcon} />}
        </span>
        {showPendingLayer && (
          <span
            className="vx-button-layer"
            data-inactive={pending ? undefined : ''}
            aria-hidden={!pending || undefined}
          >
            <Spinner />
            <span className="vx-button-text">{pendingLabel ?? children}</span>
          </span>
        )}
      </span>
    </button>
  );
}

/**
 * IconButton defaults to ghost, so a danger icon action needs no explicit variant; secondary
 * never takes the danger intent (§26.1).
 */
export type IconButtonVariant =
  | { readonly variant?: 'ghost' | 'primary'; readonly intent?: 'default' | 'danger' }
  | { readonly variant: 'secondary'; readonly intent?: 'default' };

export type IconButtonProps = NativeButton &
  IconButtonVariant &
  ActionState & {
    readonly icon: IconName;
    /** Localized accessible name, including record context where needed (§21). */
    readonly label: string;
  };

/**
 * Square icon-only action. Its label is the accessible name and, supplementally, a tooltip;
 * while pending, `pendingLabel` (when given) replaces both, as it does for Button.
 */
export function IconButton({
  icon,
  label,
  variant = 'ghost',
  intent = 'default',
  size = 'medium',
  pending = false,
  pendingLabel,
  onClick,
  type = 'button',
  ...native
}: IconButtonProps) {
  const name = pending && pendingLabel !== undefined ? pendingLabel : label;
  return (
    <Tooltip content={name}>
      <button
        {...native}
        type={type}
        aria-label={name}
        className="vx-button"
        data-icon-only=""
        data-variant={variant}
        data-intent={intent}
        data-size={size}
        data-pending={pending ? '' : undefined}
        aria-disabled={pending ? true : native['aria-disabled']}
        onClick={guard(pending, onClick)}
      >
        {pending ? <Spinner /> : <Icon name={icon} />}
      </button>
    </Tooltip>
  );
}

/** Related actions that keep individual names and focus stops. */
export function ButtonGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="vx-button-group">
      {children}
    </div>
  );
}
