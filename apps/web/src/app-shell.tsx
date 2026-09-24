import { useQuery } from '@tanstack/react-query';
import { useLocation } from '@tanstack/react-router';
import { AppShell, DisplayPreferences } from '@vertex-os/ui';
import type { ReactNode } from 'react';
import { useAppMessages } from './app-messages';
import { visibleNavigation, type GuardedNavigationGroup } from './app-navigation';
import { AccountArea } from './features/auth/account-area';
import { authQuery } from './features/auth/auth-state';
import { useIamMessages } from './features/iam/iam-messages';
import { IAM_PERMISSIONS } from './features/iam/iam-queries';
import { useOrganizationMessages } from './features/iam/organization/organization-messages';

/**
 * The production shell. Its navigation lists only destinations that exist; business modules add
 * theirs as they are implemented (no placeholder routes). Items are filtered by the signed-in
 * user's permission codes for presentation; signed out, only public destinations remain.
 */
export function ApplicationShell({ children }: { children: ReactNode }) {
  const messages = useAppMessages();
  const iamMessages = useIamMessages();
  const organizationMessages = useOrganizationMessages();
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
    {
      id: 'administration',
      label: iamMessages.administration,
      items: [
        {
          id: 'users',
          label: iamMessages.users,
          href: '/users',
          icon: 'user',
          current: pathname === '/users' || pathname.startsWith('/users/'),
          anyOf: [IAM_PERMISSIONS.usersRead],
        },
        {
          id: 'departments',
          label: organizationMessages.departments,
          href: '/departments',
          icon: 'folder',
          current: pathname === '/departments' || pathname.startsWith('/departments/'),
          anyOf: [IAM_PERMISSIONS.departmentsRead],
        },
        {
          id: 'roles',
          label: organizationMessages.roles,
          href: '/roles',
          icon: 'shield',
          current: pathname === '/roles' || pathname.startsWith('/roles/'),
          anyOf: [IAM_PERMISSIONS.rolesRead],
        },
        {
          id: 'permissions',
          label: organizationMessages.permissions,
          href: '/permissions',
          icon: 'lock',
          current: pathname === '/permissions',
          anyOf: [IAM_PERMISSIONS.permissionsRead],
        },
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
