import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Icon } from '../icons/icon';
import { useActiveModal } from '../runtime/overlay';
import { useAnnounce, useUiMessages } from '../runtime/ui-root';
import { Button, IconButton } from './button';
import { TONE_ICONS, type Tone } from './feedback';

/**
 * Optional confirmation only (§32). Critical outcomes must also live in the task context.
 * Toasts with an action, an error or information unavailable elsewhere persist; a plain
 * success may dismiss after six seconds of visible, unhovered, unfocused time.
 */
export interface ToastInput {
  /** Repeated events with the same id coalesce into one toast. */
  readonly id?: string;
  readonly tone: Tone;
  readonly message: string;
  readonly action?: { readonly label: string; readonly onAction: () => void };
  /** Keep until dismissed although it is a plain success (information not available elsewhere). */
  readonly persistent?: boolean;
}

interface ToastRecord extends ToastInput {
  readonly id: string;
  readonly revision: number;
}

export const TOAST_LIFETIME_MS = 6000;
export const MAX_VISIBLE_TOASTS = 3;

interface ToastApi {
  readonly show: (toast: ToastInput) => string;
  readonly dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
const ToastItemsContext = createContext<readonly ToastRecord[]>([]);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast requires UiRoot');
  return api;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<readonly ToastRecord[]>([]);
  const sequence = useRef(0);
  const dismiss = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);
  const show = useCallback((toast: ToastInput) => {
    sequence.current += 1;
    const id = toast.id ?? `toast-${sequence.current}`;
    const record = { ...toast, id, revision: sequence.current };
    setItems((current) =>
      current.some((item) => item.id === id)
        ? current.map((item) => (item.id === id ? record : item))
        : [...current, record],
    );
    return id;
  }, []);
  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);
  return (
    <ToastContext value={api}>
      <ToastItemsContext value={items}>
        {children}
        <ToastRegion />
      </ToastItemsContext>
    </ToastContext>
  );
}

function ToastRegion() {
  const items = useContext(ToastItemsContext);
  const { dismiss } = useToast();
  const messages = useUiMessages();
  // Toasts belong to the page behind a modal; they are suspended rather than floated above it.
  const suspended = useActiveModal() !== undefined;
  const visible = suspended ? [] : items.slice(0, MAX_VISIBLE_TOASTS);
  return (
    <section className="vx-toast-region" aria-label={messages.notifications}>
      {visible.map((item) => (
        <ToastItem key={item.id} item={item} onDismiss={() => dismiss(item.id)} />
      ))}
    </section>
  );
}

function ToastItem({ item, onDismiss }: { item: ToastRecord; onDismiss: () => void }) {
  const messages = useUiMessages();
  const announce = useAnnounce();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(() => document.hidden);
  const remaining = useRef(TOAST_LIFETIME_MS);
  const expires = item.tone === 'success' && item.action === undefined && item.persistent !== true;

  useEffect(() => {
    // Announced once each time this revision becomes visible; never steals focus.
    announce(item.message);
    remaining.current = TOAST_LIFETIME_MS;
  }, [announce, item.message, item.revision]);

  useEffect(() => {
    const update = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  useEffect(() => {
    if (!expires || hovered || focused || hidden) return undefined;
    const started = Date.now();
    const timer = setTimeout(onDismiss, remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - started));
    };
  }, [expires, hovered, focused, hidden, onDismiss, item.revision]);

  return (
    <div
      className="vx-toast"
      data-tone={item.tone}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      <Icon name={TONE_ICONS[item.tone]} />
      <p className="vx-toast-message">{item.message}</p>
      {item.action && (
        <Button variant="ghost" size="small" onClick={item.action.onAction}>
          {item.action.label}
        </Button>
      )}
      <IconButton
        icon="close"
        size="small"
        label={messages.dismissNotification}
        onClick={onDismiss}
      />
    </div>
  );
}
