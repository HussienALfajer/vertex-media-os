import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip';
import type { ReactElement } from 'react';
import { usePopupGeometry, usePopupOwnership } from '../runtime/overlay';

export interface TooltipProps {
  /** Concise supplemental text. A tooltip never supplies the only name and never holds actions. */
  readonly content: string;
  /** A single focusable trigger element that already has an accessible name. */
  readonly children: ReactElement;
}

/**
 * Supplemental explanation (§31.2): 500ms pointer dwell (grouped tooltips open immediately),
 * immediate on keyboard focus, persistent while hovered or focused, Escape dismisses.
 * Disabled while a modal the trigger does not belong to is active.
 */
export function Tooltip({ content, children }: TooltipProps) {
  const { container, owned, blocked } = usePopupOwnership();
  const { sideOffset, collisionPadding } = usePopupGeometry();
  return (
    <BaseTooltip.Root disabled={blocked}>
      <BaseTooltip.Trigger render={children} />
      <BaseTooltip.Portal container={container}>
        <BaseTooltip.Positioner
          className="vx-tooltip-positioner"
          data-owned={owned ? '' : undefined}
          sideOffset={sideOffset}
          collisionPadding={collisionPadding}
        >
          <BaseTooltip.Popup className="vx-tooltip">{content}</BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
