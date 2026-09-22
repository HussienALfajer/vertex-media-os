import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/**
 * Shared overlay ownership (docs/DESIGN_SYSTEM.md §17.2, §31.2).
 *
 * The manager records the stack of open modal layers. Popups rendered inside a modal belong
 * to it (they portal into the modal and use the modal-popup layer); anything else is global.
 * Global popups close when an unrelated modal opens, tooltips outside the active modal are
 * disabled, and toasts are suspended while a modal is active. Z-index never decides this.
 */
interface OverlayManager {
  readonly modals: readonly string[];
  readonly register: (id: string) => () => void;
}

const ManagerContext = createContext<OverlayManager | null>(null);

const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]';

/** The control that last received a pointer press (see `currentOpener`). */
let pressedControl: HTMLElement | null = null;

function rememberPressedControl(event: PointerEvent): void {
  pressedControl =
    event.target instanceof Element ? event.target.closest<HTMLElement>(FOCUSABLE) : null;
}

/** Keyboard interaction supersedes an earlier pointer press. */
function forgetPressedControl(): void {
  pressedControl = null;
}

/**
 * The control that is opening an overlay: normally the focused element. Safari/WebKit do
 * not focus a pressed button — focus stays on the body or lands on a focusable ancestor such
 * as the main region — so the pressed control is used instead, letting focus still return
 * to it on close (§20, §31.2).
 */
export function currentOpener(): HTMLElement | null {
  const active =
    document.activeElement instanceof HTMLElement && document.activeElement !== document.body
      ? document.activeElement
      : null;
  const pressed = pressedControl?.isConnected ? pressedControl : null;
  const control =
    pressed && (!active || (active !== pressed && active.contains(pressed))) ? pressed : active;
  // A menu item disappears with its menu; the menu's trigger is the logical opener.
  const menu = control?.closest('[role="menu"]');
  const id = menu?.id.replace(/["\\]/g, '\\$&');
  const trigger = id ? document.querySelector<HTMLElement>(`[aria-controls~="${id}"]`) : null;
  return trigger ?? control;
}

export function OverlayManagerProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.addEventListener('pointerdown', rememberPressedControl, true);
    document.addEventListener('keydown', forgetPressedControl, true);
    return () => {
      document.removeEventListener('pointerdown', rememberPressedControl, true);
      document.removeEventListener('keydown', forgetPressedControl, true);
    };
  }, []);
  const [modals, setModals] = useState<readonly string[]>([]);
  const register = useCallback((id: string) => {
    setModals((stack) => [...stack.filter((entry) => entry !== id), id]);
    return () => setModals((stack) => stack.filter((entry) => entry !== id));
  }, []);
  const value = useMemo(() => ({ modals, register }), [modals, register]);
  return <ManagerContext value={value}>{children}</ManagerContext>;
}

function useManager(): OverlayManager {
  const manager = useContext(ManagerContext);
  if (!manager) throw new Error('Vertex overlays require UiRoot');
  return manager;
}

/** Registers a modal layer for as long as it is open. */
export function useModalLayer(id: string, open: boolean): void {
  const { register } = useManager();
  useLayoutEffect(() => (open ? register(id) : undefined), [id, open, register]);
}

/** Id of the topmost open modal, if any. */
export function useActiveModal(): string | undefined {
  const { modals } = useManager();
  return modals.at(-1);
}

export interface OverlayOwner {
  readonly modalId: string;
  readonly container: HTMLElement | null;
}

const OwnerContext = createContext<OverlayOwner | null>(null);
export const OverlayOwnerProvider = OwnerContext.Provider;

export interface PopupOwnership {
  /** Portal container: the owning modal, or the document body for global popups. */
  readonly container: HTMLElement | null | undefined;
  readonly owned: boolean;
  /** True when a modal is active that this popup does not belong to. */
  readonly blocked: boolean;
}

export function usePopupOwnership(): PopupOwnership {
  const owner = useContext(OwnerContext);
  const active = useActiveModal();
  return {
    container: owner?.container ?? undefined,
    owned: owner !== null,
    blocked: active !== undefined && active !== owner?.modalId,
  };
}

/** Closes an open global popup when an unrelated modal becomes active. */
export function useCloseWhenBlocked(open: boolean, blocked: boolean, close: () => void): void {
  useEffect(() => {
    if (open && blocked) close();
  }, [open, blocked, close]);
}

function tokenPixels(name: string): number {
  const style = getComputedStyle(document.documentElement);
  const rem = Number.parseFloat(style.getPropertyValue(name));
  // Without the token stylesheet (unit tests) there is no geometry to apply.
  return Number.isFinite(rem) ? rem * Number.parseFloat(style.fontSize) : 0;
}

/**
 * Trigger gap and viewport collision padding for popups, in CSS pixels for the positioning
 * engine, read from the `space.popup.*` tokens so they follow the root font size (§31.1).
 */
export function usePopupGeometry(): {
  readonly sideOffset: number;
  readonly collisionPadding: number;
} {
  const [geometry] = useState(() => ({
    sideOffset: tokenPixels('--vx-space-popup-offset'),
    collisionPadding: tokenPixels('--vx-space-popup-collision-padding'),
  }));
  return geometry;
}

/**
 * Chooses where focus returns after an overlay closes: the preferred element when it still
 * exists and is usable, otherwise the page's declared fallback (the main region), never the
 * document body (§20). See `restoreFocus`.
 */
export function resolveReturnFocus(preferred: HTMLElement | null | undefined): HTMLElement | null {
  const usable = (element: HTMLElement | null | undefined): element is HTMLElement =>
    element !== null &&
    element !== undefined &&
    element.isConnected &&
    element.matches(FOCUSABLE) &&
    !element.matches(':disabled') &&
    element.closest('[inert], [hidden]') === null;
  if (usable(preferred)) return preferred;
  const fallback = document.querySelector<HTMLElement>('[data-vx-focus-fallback]');
  return usable(fallback) ? fallback : null;
}

/**
 * Returns focus after a modal closes. The target itself receives focus, even when it is a
 * non-tabbable fallback such as the main region; the primitive library would instead move
 * to its first tabbable descendant, an arbitrary control. Focus the user deliberately moved
 * elsewhere (for example by pressing another field outside a clean dialog) is left alone.
 * Returns `false` so the library does not also move focus.
 */
export function restoreFocus(preferred: HTMLElement | null | undefined): false {
  const target = resolveReturnFocus(preferred);
  queueMicrotask(() => {
    const active = document.activeElement;
    const unclaimed = active === null || active === document.body || !active.isConnected;
    if (target && unclaimed) target.focus({ preventScroll: true });
  });
  return false;
}
