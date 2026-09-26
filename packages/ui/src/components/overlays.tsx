import { AlertDialog as BaseAlertDialog } from '@base-ui/react/alert-dialog';
import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { Menu } from '@base-ui/react/menu';
import { Popover as BasePopover } from '@base-ui/react/popover';
import {
  createContext,
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react';
import { Icon, type IconName } from '../icons/icon';
import {
  currentOpener,
  OverlayOwnerProvider,
  resolveReturnFocus,
  restoreFocus,
  useCloseWhenBlocked,
  useModalLayer,
  usePopupGeometry,
  usePopupOwnership,
} from '../runtime/overlay';
import { UiLink, useUiMessages } from '../runtime/ui-root';
import { Button, IconButton } from './button';

type ModalKind = 'dialog' | 'alertdialog' | 'drawer';

interface ModalControl {
  /** Routes every dismissal path (close button, Escape, outside press, Cancel) through one guard. */
  readonly requestClose: () => void;
}

const ModalControlContext = createContext<ModalControl | null>(null);

interface ModalFrameProps {
  readonly kind: ModalKind;
  readonly open: boolean;
  readonly requestClose: () => void;
  readonly title: string;
  readonly description?: ReactNode | undefined;
  readonly children: ReactNode;
  readonly footer?: ReactNode | undefined;
  readonly size?: 'default' | 'wide' | undefined;
  readonly side?: 'start' | 'end' | undefined;
  readonly initialFocus?: RefObject<HTMLElement | null> | undefined;
  readonly returnFocus?: RefObject<HTMLElement | null> | undefined;
  readonly pointerDismissal: boolean;
  readonly closeButton: boolean;
}

function ModalFrame({
  kind,
  open,
  requestClose,
  title,
  description,
  children,
  footer,
  size = 'default',
  side = 'end',
  initialFocus,
  returnFocus,
  pointerDismissal,
  closeButton,
}: ModalFrameProps) {
  const messages = useUiMessages();
  const id = useId();
  useModalLayer(id, open);
  const [popup, setPopup] = useState<HTMLDivElement | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (open) opener.current = currentOpener();
  }, [open]);
  // Return focus in the same commit that closes the modal, while it still holds focus. The
  // primitive makes the closing popup inert, which drops focus to the document before its own
  // (effect-time) restoration; screen readers then announce the top of the page instead of
  // the opener (NVDA, E-12a). Focus the user moved elsewhere is left alone.
  const wasOpen = useRef(open);
  useLayoutEffect(() => {
    if (wasOpen.current && !open) {
      const active = document.activeElement;
      const held =
        active === null ||
        active === document.body ||
        !active.isConnected ||
        (popup?.contains(active) ?? false);
      const target = resolveReturnFocus(returnFocus?.current ?? opener.current);
      if (held && target) target.focus({ preventScroll: true });
    }
    wasOpen.current = open;
  }, [open, popup, returnFocus]);
  const Parts = kind === 'alertdialog' ? BaseAlertDialog : BaseDialog;
  const control = { requestClose };
  return (
    <Parts.Root
      open={open}
      disablePointerDismissal={!pointerDismissal}
      onOpenChange={(next, details) => {
        if (next) return;
        // The Vertex owner decides every close; Base UI never closes on its own.
        details.cancel();
        requestClose();
      }}
    >
      <Parts.Portal>
        <Parts.Backdrop className="vx-scrim" />
        <Parts.Popup
          ref={setPopup}
          className="vx-modal"
          data-kind={kind}
          data-size={size}
          data-side={kind === 'drawer' ? side : undefined}
          initialFocus={initialFocus ?? heading}
          finalFocus={() => restoreFocus(returnFocus?.current ?? opener.current)}
        >
          <ModalControlContext value={control}>
            <OverlayOwnerProvider value={{ modalId: id, container: popup }}>
              <div className="vx-modal-header">
                <Parts.Title ref={heading} tabIndex={-1} className="vx-modal-title">
                  {title}
                </Parts.Title>
                {closeButton && (
                  <Parts.Close render={<IconButton icon="close" label={messages.close} />} />
                )}
              </div>
              {description && (
                <Parts.Description className="vx-modal-description">
                  {description}
                </Parts.Description>
              )}
              {children}
              {footer}
            </OverlayOwnerProvider>
          </ModalControlContext>
        </Parts.Popup>
      </Parts.Portal>
    </Parts.Root>
  );
}

interface GuardedModalProps {
  readonly open: boolean;
  /** Called with `false` only after dismissal is allowed (clean, or discard confirmed). */
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description?: ReactNode;
  readonly children: ReactNode;
  /** Usually `DialogCancel` plus the task's commit action. */
  readonly actions?: ReactNode;
  /** Unsaved edits: every dismissal asks to continue editing or discard, keeping the draft (§28.4). */
  readonly dirty?: boolean;
  /** Defaults to the title heading; pass the first meaningful input for short routine forms. */
  readonly initialFocus?: RefObject<HTMLElement | null>;
  /** The logical control to focus on close when the opener will not survive (§20). */
  readonly returnFocus?: RefObject<HTMLElement | null>;
}

function useGuard(dirty: boolean, onOpenChange: (open: boolean) => void) {
  const [confirming, setConfirming] = useState(false);
  const requestClose = useCallback(() => {
    if (dirty) setConfirming(true);
    else onOpenChange(false);
  }, [dirty, onOpenChange]);
  return { confirming, setConfirming, requestClose };
}

function UnsavedChanges({
  onContinue,
  onDiscard,
}: {
  onContinue: () => void;
  onDiscard: () => void;
}) {
  const messages = useUiMessages();
  const safe = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => safe.current?.focus(), []);
  return (
    <div className="vx-modal-confirmation" role="alert">
      <p className="vx-modal-confirmation-title">{messages.unsavedTitle}</p>
      <p>{messages.unsavedDescription}</p>
      <div className="vx-form-actions">
        <Button variant="ghost" intent="danger" onClick={onDiscard}>
          {messages.discardChanges}
        </Button>
        <Button ref={safe} variant="primary" onClick={onContinue}>
          {messages.continueEditing}
        </Button>
      </div>
    </div>
  );
}

function GuardedModal({
  kind,
  size,
  side,
  open,
  onOpenChange,
  title,
  description,
  children,
  actions,
  dirty = false,
  initialFocus,
  returnFocus,
}: GuardedModalProps & {
  kind: 'dialog' | 'drawer';
  size?: 'default' | 'wide';
  side?: 'start' | 'end';
}) {
  const { confirming, setConfirming, requestClose } = useGuard(dirty, onOpenChange);
  const resume = useRef<Element | null>(null);
  const confirmingNow = confirming && open;
  return (
    <ModalFrame
      kind={kind}
      size={size}
      side={side}
      open={open}
      title={title}
      description={description}
      initialFocus={initialFocus}
      returnFocus={returnFocus}
      pointerDismissal
      closeButton
      requestClose={() => {
        if (confirmingNow) {
          setConfirming(false);
          return;
        }
        resume.current = document.activeElement;
        requestClose();
      }}
      footer={
        actions && (
          <div className="vx-modal-footer" hidden={confirmingNow}>
            {actions}
          </div>
        )
      }
    >
      {/* The draft stays mounted while the confirmation replaces it visually. */}
      <div className="vx-modal-body" hidden={confirmingNow}>
        {children}
      </div>
      {confirmingNow && (
        <UnsavedChanges
          onContinue={() => {
            setConfirming(false);
            requestAnimationFrame(() => {
              if (resume.current instanceof HTMLElement && resume.current.isConnected)
                resume.current.focus();
            });
          }}
          onDiscard={() => {
            setConfirming(false);
            onOpenChange(false);
          }}
        />
      )}
    </ModalFrame>
  );
}

export type DialogProps = GuardedModalProps & {
  /** 480px by default; `wide` (640px) only for a justified structured form (§31.1). */
  readonly size?: 'default' | 'wide';
};

/** One focused task or confirmation; centred; background inert (§31). */
export function Dialog(props: DialogProps) {
  return <GuardedModal {...props} kind="dialog" />;
}

export type DrawerProps = GuardedModalProps & {
  /** Navigation enters from inline-start; contextual tasks from inline-end (§24.1). */
  readonly side?: 'start' | 'end';
  readonly size?: 'default' | 'wide';
};

/** Modal drawer for a contextual multi-section task; full width below 768px (§31.1). */
export function Drawer(props: DrawerProps) {
  return <GuardedModal {...props} kind="drawer" />;
}

/** Cancel action for a Dialog/Drawer footer; goes through the same dirty guard as Escape. */
export function DialogCancel({ children }: { children?: ReactNode }) {
  const control = useContext(ModalControlContext);
  const messages = useUiMessages();
  if (!control) throw new Error('DialogCancel must be inside a Dialog or Drawer');
  return <Button onClick={control.requestClose}>{children ?? messages.cancel}</Button>;
}

export interface AlertDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The specific action, e.g. "تعطيل المستخدم؟" — never a bare "Are you sure?" (§35). */
  readonly title: string;
  /** Consequences and reversibility. */
  readonly description: ReactNode;
  /** Exact target identity, scope/count and, for financial commitment, amount and currency. */
  readonly children?: ReactNode;
  /** The real verb, e.g. "تعطيل المستخدم"; never "نعم" or "موافق". */
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  readonly onConfirm: () => void;
  /** Danger fill only for harmful/destructive commitment; privilege grants use primary. */
  readonly intent?: 'danger' | 'default';
  /** A non-cancellable operation is running: dismissal is deferred with a visible explanation. */
  readonly pending?: boolean;
  /** Prevent commitment until required review facts have loaded. */
  readonly confirmDisabled?: boolean;
  readonly pendingLabel?: string;
  readonly returnFocus?: RefObject<HTMLElement | null>;
}

/** Deliberate confirmation: safe action focused first, no outside dismissal, Escape cancels. */
export function AlertDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel,
  cancelLabel,
  onConfirm,
  intent = 'danger',
  pending = false,
  confirmDisabled = false,
  pendingLabel,
  returnFocus,
}: AlertDialogProps) {
  const messages = useUiMessages();
  const safe = useRef<HTMLButtonElement>(null);
  return (
    <ModalFrame
      kind="alertdialog"
      open={open}
      title={title}
      description={description}
      initialFocus={safe}
      returnFocus={returnFocus}
      pointerDismissal={false}
      closeButton={false}
      requestClose={() => {
        if (!pending) onOpenChange(false);
      }}
      footer={
        <div className="vx-modal-footer">
          {pending && (
            <p className="vx-modal-pending" role="status">
              {messages.pendingDismissal}
            </p>
          )}
          <Button
            ref={safe}
            aria-disabled={pending || undefined}
            onClick={() => {
              if (!pending) onOpenChange(false);
            }}
          >
            {cancelLabel ?? messages.cancel}
          </Button>
          <Button
            variant="primary"
            intent={intent}
            disabled={confirmDisabled}
            pending={pending}
            pendingLabel={pendingLabel ?? messages.working}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      {children && <div className="vx-modal-body">{children}</div>}
    </ModalFrame>
  );
}

export interface MenuItemSpec {
  readonly id: string;
  readonly label: string;
  readonly icon?: IconName;
  /** Destructive items are always separated and placed last (§30). */
  readonly intent?: 'danger';
  readonly onSelect?: () => void;
  /** Navigation item rendered as a link through the application's link component. */
  readonly href?: string;
  readonly disabled?: boolean;
  /** Why an item is unavailable; announced with the item, not hidden in a tooltip. */
  readonly description?: string;
}

export interface DropdownMenuProps {
  /** Usually an IconButton or Button whose name includes the record context. */
  readonly trigger: ReactElement;
  readonly items: readonly MenuItemSpec[];
}

/** Short action list: arrows, Home/End, typeahead (including Arabic), Escape (§30). */
export function DropdownMenu({ trigger, items }: DropdownMenuProps) {
  const { container, owned, blocked } = usePopupOwnership();
  const { sideOffset, collisionPadding } = usePopupGeometry();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  useCloseWhenBlocked(open, blocked, close);
  const ordinary = items.filter((item) => item.intent !== 'danger');
  const destructive = items.filter((item) => item.intent === 'danger');
  const render = (item: MenuItemSpec) => {
    const content = (
      <>
        {item.icon && <Icon name={item.icon} />}
        <span className="vx-menu-item-text">
          <span>{item.label}</span>
          {item.description && <span className="vx-menu-item-description">{item.description}</span>}
        </span>
      </>
    );
    return item.href !== undefined && !item.disabled ? (
      <Menu.LinkItem
        key={item.id}
        className="vx-menu-item"
        render={<UiLink href={item.href} />}
        label={item.label}
      >
        {content}
      </Menu.LinkItem>
    ) : (
      <Menu.Item
        key={item.id}
        className="vx-menu-item"
        data-intent={item.intent}
        disabled={item.disabled}
        label={item.label}
        onClick={item.onSelect}
      >
        {content}
      </Menu.Item>
    );
  };
  return (
    <Menu.Root open={open} onOpenChange={(next) => setOpen(next && !blocked)} modal={false}>
      <Menu.Trigger render={trigger} />
      <Menu.Portal container={container}>
        <Menu.Positioner
          className="vx-popup-positioner"
          data-owned={owned ? '' : undefined}
          side="bottom"
          align="start"
          sideOffset={sideOffset}
          collisionPadding={collisionPadding}
        >
          <Menu.Popup className="vx-menu">
            {ordinary.map(render)}
            {ordinary.length > 0 && destructive.length > 0 && (
              <Menu.Separator className="vx-menu-separator" />
            )}
            {destructive.map(render)}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

export interface PopoverProps {
  readonly trigger: ReactElement;
  /** Visible title that names the popover. */
  readonly title: string;
  readonly children: ReactNode;
}

/** Nonmodal contextual content such as filters; closes on Escape, outside press or focus leaving. */
export function Popover({ trigger, title, children }: PopoverProps) {
  const messages = useUiMessages();
  const { container, owned, blocked } = usePopupOwnership();
  const { sideOffset, collisionPadding } = usePopupGeometry();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  useCloseWhenBlocked(open, blocked, close);
  return (
    <BasePopover.Root open={open} onOpenChange={(next) => setOpen(next && !blocked)}>
      <BasePopover.Trigger render={trigger} />
      <BasePopover.Portal container={container}>
        <BasePopover.Positioner
          className="vx-popup-positioner"
          data-owned={owned ? '' : undefined}
          side="bottom"
          align="start"
          sideOffset={sideOffset}
          collisionPadding={collisionPadding}
        >
          <BasePopover.Popup className="vx-popover">
            <div className="vx-popover-header">
              <BasePopover.Title className="vx-popover-title">{title}</BasePopover.Title>
              <BasePopover.Close
                render={<IconButton icon="close" size="small" label={messages.close} />}
              />
            </div>
            <div className="vx-popover-body">{children}</div>
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}
