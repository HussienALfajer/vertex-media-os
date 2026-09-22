import { DirectionProvider } from '@base-ui/react/direction-provider';
import { Tooltip } from '@base-ui/react/tooltip';
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentPropsWithRef,
  type ComponentType,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { ToastProvider } from '../components/toast';
import { UI_MESSAGES, type UiMessages } from './messages';
import { OverlayManagerProvider } from './overlay';
import {
  installUiSettings,
  type PreferenceChange,
  type SettingsStore,
  type UiSettings,
} from './settings';

/** Props the design system passes to the application's link implementation. */
export type UiLinkProps = Omit<ComponentPropsWithRef<'a'>, 'href' | 'style'> & { href: string };
export type UiLinkComponent = ComponentType<UiLinkProps>;

function NativeLink({ children, ...props }: UiLinkProps) {
  return <a {...props}>{children}</a>;
}

interface RootContextValue {
  readonly store: SettingsStore;
  readonly link: UiLinkComponent;
  readonly announce: (message: string) => void;
}

const RootContext = createContext<RootContextValue | null>(null);

function useRoot(): RootContextValue {
  const root = useContext(RootContext);
  if (!root) throw new Error('Vertex UI components must render inside UiRoot');
  return root;
}

export interface UiRootProps {
  readonly children: ReactNode;
  /**
   * Router-aware anchor supplied by the application (router coupling stays outside the
   * design system). Defaults to a native anchor.
   */
  readonly linkComponent?: UiLinkComponent;
}

/**
 * The single root of every Vertex surface: settings, direction for third-party primitives,
 * overlay ownership, one polite announcer and the toast region.
 */
export function UiRoot({ children, linkComponent = NativeLink }: UiRootProps) {
  const [store] = useState(installUiSettings);
  const settings = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [announcement, setAnnouncement] = useState('');
  const frame = useRef<number | undefined>(undefined);
  const announce = useCallback((message: string) => {
    // Clearing first makes an identical consecutive message announce again.
    setAnnouncement('');
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => setAnnouncement(message));
  }, []);
  const value = useMemo(
    () => ({ store, link: linkComponent, announce }),
    [store, linkComponent, announce],
  );
  return (
    <RootContext value={value}>
      <DirectionProvider direction={settings.direction}>
        <OverlayManagerProvider>
          <Tooltip.Provider delay={500} closeDelay={0}>
            <ToastProvider>{children}</ToastProvider>
          </Tooltip.Provider>
        </OverlayManagerProvider>
      </DirectionProvider>
      {createPortal(
        // Portalled beside modal portals so an active modal never hides announcements.
        <div className="vx-visually-hidden" role="status" aria-live="polite" aria-atomic="true">
          {announcement}
        </div>,
        document.body,
      )}
    </RootContext>
  );
}

export function useUiSettings(): UiSettings & {
  readonly setPreferences: (change: PreferenceChange) => void;
} {
  const { store } = useRoot();
  const settings = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return useMemo(() => ({ ...settings, setPreferences: store.set }), [settings, store]);
}

export function useUiMessages(): UiMessages {
  return UI_MESSAGES[useUiSettings().language];
}

/** Sends one polite announcement through the shared live region (§25, §32). */
export function useAnnounce(): (message: string) => void {
  return useRoot().announce;
}

/** Link rendered through the application's router adapter (or a native anchor). */
export function UiLink(props: UiLinkProps) {
  return createElement(useRoot().link, props);
}
