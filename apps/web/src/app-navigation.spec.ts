import { describe, expect, it } from 'vitest';
import { visibleNavigation, type GuardedNavigationGroup } from './app-navigation';

const groups: GuardedNavigationGroup[] = [
  { id: 'main', items: [{ id: 'home', label: 'Home', href: '/', icon: 'home' }] },
  {
    id: 'administration',
    label: 'Administration',
    items: [
      {
        id: 'users',
        label: 'Users',
        href: '/admin/users',
        icon: 'user',
        anyOf: ['iam.users.read'],
      },
      {
        id: 'roles',
        label: 'Roles',
        href: '/admin/roles',
        icon: 'shield',
        anyOf: ['iam.roles.read', 'iam.roles.manage'],
      },
    ],
  },
];

describe('permission-aware navigation (presentation only)', () => {
  it('shows an item when any of its permission codes is held', () => {
    expect(visibleNavigation(groups, ['iam.roles.manage'])).toEqual([
      groups[0],
      {
        id: 'administration',
        label: 'Administration',
        items: [{ id: 'roles', label: 'Roles', href: '/admin/roles', icon: 'shield' }],
      },
    ]);
  });

  it('omits a group whose items are all hidden, without revealing it', () => {
    expect(visibleNavigation(groups, [])).toEqual([groups[0]]);
    expect(visibleNavigation(groups, ['iam.departments.read'])).toEqual([groups[0]]);
  });

  it('keeps items without permission codes for every signed-in user', () => {
    expect(visibleNavigation(groups, ['iam.users.read']).flatMap((group) => group.items)).toEqual([
      { id: 'home', label: 'Home', href: '/', icon: 'home' },
      { id: 'users', label: 'Users', href: '/admin/users', icon: 'user' },
    ]);
  });
});
