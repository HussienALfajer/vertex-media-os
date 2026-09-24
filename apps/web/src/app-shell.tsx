import { useQuery } from '@tanstack/react-query';
import { useLocation } from '@tanstack/react-router';
import { AppShell, DisplayPreferences } from '@vertex-os/ui';
import type { ReactNode } from 'react';
import { useAppMessages } from './app-messages';
import { visibleNavigation, type GuardedNavigationGroup } from './app-navigation';
import { AccountArea } from './features/auth/account-area';
import { authQuery } from './features/auth/auth-state';

/**
 * The production shell. Its navigation lists only destinations that exist; business modules add
 * theirs as they are implemented (no placeholder routes). Items are filtered by the signed-in
 * user's permission codes for presentation; signed out, only public destinations remain.
 */
export function ApplicationShell({ children }: { children: ReactNode }) {
  const messages = useAppMessages();
  const { pathname } = useLocation();
  const { data: auth } = useQuery(authQuery);
  const signedIn = auth?.status === 'signed-in' ? auth : undefined;
  const destinations: GuardedNavigationGroup[] = [
    {
      id: 'main',
      items: [
        { id: 'home', label: messages.home, href: '/', icon: 'home', current: pathname === '/' },
      ],
    },
  ];
  return (
    <AppShell
      productName="Vertex OS"
      homeHref="/"
      navigation={visibleNavigation(destinations, signedIn?.permissionCodes ?? [])}
      utilities={<DisplayPreferences />}
      sidebarFooter={
        signedIn && <AccountArea user={signedIn.user} departments={signedIn.departments} />
      }
    >
      {children}
    </AppShell>
  );
}
