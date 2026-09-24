import type { NavigationGroup, NavigationItem } from '@vertex-os/ui';

/**
 * A navigation destination and the permission codes that make it visible (any of them). An item
 * without codes is shown to every signed-in user. Visibility is presentation only: the API
 * authorizes every request (IAM-R08 D-11, Master Plan invariant 19).
 */
export interface GuardedNavigationItem extends NavigationItem {
  readonly anyOf?: readonly string[];
}

export interface GuardedNavigationGroup extends Omit<NavigationGroup, 'items'> {
  readonly items: readonly GuardedNavigationItem[];
}

/** Drops the items the permission codes do not cover and the groups left empty (DESIGN_SYSTEM Section 30). */
export function visibleNavigation(
  groups: readonly GuardedNavigationGroup[],
  permissionCodes: readonly string[],
): NavigationGroup[] {
  const held = new Set(permissionCodes);
  return groups.flatMap((group) => {
    const items = group.items
      .filter((item) => item.anyOf === undefined || item.anyOf.some((code) => held.has(code)))
      .map(({ anyOf: _anyOf, ...item }) => item);
    return items.length === 0 ? [] : [{ ...group, items }];
  });
}
