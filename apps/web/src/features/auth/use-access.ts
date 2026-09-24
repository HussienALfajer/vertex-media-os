import { useQuery } from '@tanstack/react-query';
import { authQuery, type CurrentUser } from './auth-state';

export interface Access {
  readonly user: CurrentUser | undefined;
  /** Whether the signed-in user holds the permission code. Presentation only (invariant 19). */
  readonly can: (permission: string) => boolean;
}

/**
 * The signed-in user and their effective permission codes, for showing or hiding screens and
 * actions. The API authorizes every request; a hidden action is a convenience, not a control.
 */
export function useAccess(): Access {
  const { data } = useQuery(authQuery);
  const signedIn = data?.status === 'signed-in' ? data : undefined;
  const codes = new Set(signedIn?.permissionCodes ?? []);
  return { user: signedIn?.user, can: (permission) => codes.has(permission) };
}
