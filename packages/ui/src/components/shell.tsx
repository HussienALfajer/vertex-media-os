import { useCallback, useState, useSyncExternalStore, type ReactNode } from 'react';
import { UiLink, useUiMessages } from '../runtime/ui-root';
import { IconButton } from './button';
import { SidebarNav, type NavigationGroup } from './navigation';
import { Drawer } from './overlays';

const supportsMedia = () => typeof window.matchMedia === 'function';

function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!supportsMedia()) return () => undefined;
      const list = window.matchMedia(query);
      list.addEventListener('change', notify);
      return () => list.removeEventListener('change', notify);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => supportsMedia() && window.matchMedia(query).matches,
    () => false,
  );
}

/** §23 breakpoints, in rem so browser zoom and text size move them. */
const MEDIUM = '(min-width: 48rem)';
const WIDE = '(min-width: 75rem)';

export interface AppShellProps {
  /** Typographic identity used until an approved vector lockup exists (§5.2). */
  readonly productName: string;
  readonly homeHref: string;
  readonly navigation: readonly NavigationGroup[];
  /** Work-area context at the header's inline-start. Never a duplicate of the page title. */
  readonly header?: ReactNode;
  /** Global utilities at the header's inline-end; only capabilities that really exist. */
  readonly utilities?: ReactNode;
  /** Bottom account/settings area of the sidebar. */
  readonly sidebarFooter?: ReactNode;
  readonly children: ReactNode;
}

/**
 * Arabic-first application shell (§22.1, §23): sidebar at inline-start (240px wide range,
 * 64px rail in the medium range or when collapsed, modal drawer below 768px), a 56px
 * minimum header over the content area, one main landmark and a first-focus skip link.
 */
export function AppShell({
  productName,
  homeHref,
  navigation,
  header,
  utilities,
  sidebarFooter,
  children,
}: AppShellProps) {
  const messages = useUiMessages();
  const medium = useMediaQuery(MEDIUM);
  const wide = useMediaQuery(WIDE);
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const layout = !medium ? 'narrow' : !wide || collapsed ? 'rail' : 'expanded';
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const [previousLayout, setPreviousLayout] = useState(layout);
  if (layout !== previousLayout) {
    // Navigation shown inline again: the drawer is no longer the navigation surface.
    setPreviousLayout(layout);
    if (layout === 'expanded') setDrawerOpen(false);
  }

  const brand = (
    <UiLink href={homeHref} className="vx-brand">
      <span className="vx-brand-name">{productName}</span>
      <span className="vx-visually-hidden"> — {messages.homeDestination}</span>
    </UiLink>
  );

  return (
    <div className="vx-shell" data-layout={layout}>
      <a className="vx-skip-link" href="#vx-main">
        {messages.skipToContent}
      </a>
      {layout !== 'narrow' && (
        <div className="vx-shell-sidebar">
          <div className="vx-shell-sidebar-top">
            {layout === 'expanded' ? (
              <>
                {brand}
                <IconButton
                  icon="panel-collapse"
                  label={messages.collapseNavigation}
                  aria-expanded
                  onClick={() => setCollapsed(true)}
                />
              </>
            ) : (
              <IconButton
                icon="panel-expand"
                label={messages.expandNavigation}
                aria-expanded={false}
                onClick={() => (wide ? setCollapsed(false) : setDrawerOpen(true))}
              />
            )}
          </div>
          <SidebarNav
            label={messages.mainNavigation}
            groups={navigation}
            rail={layout === 'rail'}
          />
          {sidebarFooter && <div className="vx-shell-sidebar-footer">{sidebarFooter}</div>}
        </div>
      )}
      <div className="vx-shell-body">
        <header className="vx-shell-header">
          {layout === 'narrow' && (
            <>
              <IconButton
                icon="menu"
                label={messages.openNavigation}
                onClick={() => setDrawerOpen(true)}
              />
              {brand}
            </>
          )}
          <div className="vx-shell-header-context">{header}</div>
          {utilities && <div className="vx-shell-header-utilities">{utilities}</div>}
        </header>
        <main id="vx-main" className="vx-shell-main" tabIndex={-1} data-vx-focus-fallback="">
          {children}
        </main>
      </div>
      <Drawer
        side="start"
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title={messages.mainNavigation}
      >
        <SidebarNav label={messages.mainNavigation} groups={navigation} onNavigate={closeDrawer} />
        {sidebarFooter && <div className="vx-shell-sidebar-footer">{sidebarFooter}</div>}
      </Drawer>
    </div>
  );
}
