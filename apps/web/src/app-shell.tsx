import { useLocation } from '@tanstack/react-router';
import { AppShell, DisplayPreferences, type NavigationGroup } from '@vertex-os/ui';
import type { ReactNode } from 'react';
import { useAppMessages } from './app-messages';

/**
 * The production shell. Its navigation lists only destinations that exist; business
 * modules add theirs as they are implemented (no placeholder routes).
 */
export function ApplicationShell({ children }: { children: ReactNode }) {
  const messages = useAppMessages();
  const { pathname } = useLocation();
  const navigation: NavigationGroup[] = [
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
      navigation={navigation}
      utilities={<DisplayPreferences />}
    >
      {children}
    </AppShell>
  );
}
