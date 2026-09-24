import { queryOptions, type QueryClient } from '@tanstack/react-query';
import {
  apiRequest,
  forgetCsrfToken,
  isApiProblem,
  isRecord,
  NetworkFailure,
} from '../../lib/http';

/**
 * The browser's view of its authentication state (IAM-R08 D-05). It is read from the API on
 * every bootstrap and refresh; nothing of it is persisted. Permission codes drive presentation
 * only: the API authorizes every request (Master Plan invariant 19).
 */
export type AuthState =
  | {
      readonly status: 'signed-in';
      readonly user: CurrentUser;
      readonly departments: readonly CurrentDepartment[];
      readonly permissionCodes: readonly string[];
    }
  | { readonly status: 'signed-out'; readonly reason: SignedOutReason }
  | { readonly status: 'inactive' };

/** Why there is no session: none yet, it expired, or the API ended it. */
export type SignedOutReason = 'required' | 'expired' | 'ended';

export interface CurrentUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
}

export interface CurrentDepartment {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly isPrimary: boolean;
}

/** The parts of a cached query this module uses, for every query's data and error types. */
interface AnyQuery {
  readonly queryKey: readonly unknown[];
  readonly meta?: Record<string, unknown> | undefined;
  readonly state: { readonly data: unknown };
  setState(state: { data: undefined; dataUpdatedAt: number }): void;
}

/** Query keys that hold no protected data and survive a clearing. */
const PUBLIC_QUERY_ROOTS: ReadonlySet<unknown> = new Set(['auth', 'system']);

export const AUTH_QUERY_KEY = ['auth'] as const;

export const authQuery = queryOptions({
  queryKey: AUTH_QUERY_KEY,
  queryFn: ({ signal }) => readAuthState(signal),
  // A failure is shown at once with a retry action; nothing polls the session (D-06).
  retry: false,
  staleTime: 0,
  refetchOnWindowFocus: true,
});

/**
 * Reads the session, then the current user's departments and permission codes. A `401` or
 * `403 IAM_USER_INACTIVE` is a state, not an error; a network failure or any other answer is an
 * error, so it is never mistaken for being signed out.
 */
export async function readAuthState(signal?: AbortSignal): Promise<AuthState> {
  try {
    const session = await apiRequest('/api/auth/session', signal === undefined ? {} : { signal });
    const user = currentUserOf(isRecord(session) ? session['user'] : undefined);
    const me = await apiRequest('/api/iam/me', signal === undefined ? {} : { signal });
    if (!isRecord(me)) throw unexpected();
    const meUser = currentUserOf(me['user']);
    if (meUser.id !== user.id) throw unexpected();
    return {
      status: 'signed-in',
      user: meUser,
      departments: departmentsOf(me['departments']),
      permissionCodes: stringsOf(me['permissionCodes']),
    };
  } catch (error) {
    const refused = refusedSessionState(error);
    if (refused !== undefined) return refused;
    throw error;
  }
}

/**
 * The state a session refusal proves: `401` is signed out (with the reason its code names) and
 * `403 IAM_USER_INACTIVE` is inactive. The API clears the session cookie with such a refusal, so
 * the state is taken from the refusal itself, never from a re-read that would only answer
 * `AUTHENTICATION_REQUIRED` (review S-2).
 */
function refusedSessionState(error: unknown): AuthState | undefined {
  if (isApiProblem(error, 401)) {
    const reason: SignedOutReason =
      error.code === 'AUTH_SESSION_EXPIRED'
        ? 'expired'
        : error.code === 'AUTH_SESSION_INVALID'
          ? 'ended'
          : 'required';
    return { status: 'signed-out', reason };
  }
  if (isApiProblem(error, 403, 'IAM_USER_INACTIVE')) return { status: 'inactive' };
  return undefined;
}

/**
 * Removes every protected query and mutation and the CSRF token (D-10). The authentication
 * state and the public liveness check stay.
 */
export function clearProtectedState(client: QueryClient): void {
  forgetCsrfToken();
  client.removeQueries({ predicate: (query) => !PUBLIC_QUERY_ROOTS.has(query.queryKey[0]) });
  client.getMutationCache().clear();
}

/** The permission a protected query's data requires, declared as `meta.permission`. */
function requiredPermission(query: AnyQuery): string | undefined {
  const permission = query.meta?.['permission'];
  return typeof permission === 'string' ? permission : undefined;
}

/**
 * Keeps protected data consistent with the authentication state: everything protected goes when
 * the state leaves `signed-in` or names another user, and a query whose declared permission the
 * refreshed codes no longer include is removed. Removal empties the cache only; `SessionGate`
 * remounts the protected views on the same changes so none keeps rendering removed data (review
 * S-1). Returns the unsubscribe function.
 */
export function watchAuthState(client: QueryClient): () => void {
  let signedInUser: string | undefined;
  return client.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || event.query.queryKey[0] !== AUTH_QUERY_KEY[0]) return;
    const state = event.query.state.data as AuthState | undefined;
    if (state === undefined) return;
    if (state.status !== 'signed-in') {
      if (signedInUser !== undefined || state.status === 'inactive') clearProtectedState(client);
      signedInUser = undefined;
      return;
    }
    if (signedInUser !== undefined && signedInUser !== state.user.id) clearProtectedState(client);
    signedInUser = state.user.id;
    const codes = new Set(state.permissionCodes);
    client.removeQueries({
      predicate: (query) => {
        // Only held data is removed: a view mounted after the loss may still ask, and the API
        // answers it with 403 (removing its query mid-flight would leave it pending forever).
        const permission = requiredPermission(query);
        return permission !== undefined && !codes.has(permission) && query.state.data !== undefined;
      },
    });
  });
}

/**
 * Reacts to an API refusal of any protected query or mutation: a `401` or an inactive account
 * clears protected state and becomes the authentication state; a `403 AUTHORIZATION_DENIED`
 * drops the refused query's data (its error stays) and re-reads the permission codes.
 */
export function handleApiError(client: QueryClient, error: unknown, query?: AnyQuery): void {
  if (query !== undefined && query.queryKey[0] === AUTH_QUERY_KEY[0]) return;
  const refused = refusedSessionState(error);
  if (refused !== undefined) {
    clearProtectedState(client);
    // Only the first refusal names the reason: the API cleared the cookie with it, so any later
    // request (a view refetching while it unmounts) answers `AUTHENTICATION_REQUIRED`.
    const current = client.getQueryData(authQuery.queryKey);
    if (current === undefined || current.status === 'signed-in') {
      client.setQueryData(authQuery.queryKey, refused);
    }
    return;
  }
  if (isApiProblem(error, 403, 'AUTHORIZATION_DENIED')) {
    query?.setState({ data: undefined, dataUpdatedAt: 0 });
    void refreshAuthState(client);
  }
}

/** Re-reads the authentication state now, whether or not a component currently observes it. */
function refreshAuthState(client: QueryClient): Promise<void> {
  return client.invalidateQueries({ queryKey: AUTH_QUERY_KEY, refetchType: 'all' });
}

/**
 * Ends the session (spec Section 32) and returns where the browser goes next. Protected state is
 * cleared first, so nothing protected stays rendered while the browser leaves.
 */
export async function signOut(client: QueryClient): Promise<string | undefined> {
  try {
    const body = await apiRequest('/api/auth/logout', { method: 'POST' });
    const next = isRecord(body) ? safeUrl(body['logoutUrl']) : undefined;
    clearProtectedState(client);
    const signedOut: AuthState = { status: 'signed-out', reason: 'required' };
    client.setQueryData(authQuery.queryKey, signedOut);
    return next;
  } catch (error) {
    // The session is already gone: the browser is signed out either way.
    const refused = refusedSessionState(error);
    if (refused !== undefined) {
      clearProtectedState(client);
      client.setQueryData(authQuery.queryKey, refused);
      return undefined;
    }
    throw error;
  }
}

/** Only an absolute `http:` or `https:` URL from the API is followed. */
function safeUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function unexpected(): NetworkFailure {
  return new NetworkFailure('Unexpected authentication response from the API');
}

function currentUserOf(value: unknown): CurrentUser {
  if (
    !isRecord(value) ||
    typeof value['id'] !== 'string' ||
    typeof value['email'] !== 'string' ||
    typeof value['displayName'] !== 'string'
  ) {
    throw unexpected();
  }
  return { id: value['id'], email: value['email'], displayName: value['displayName'] };
}

function departmentsOf(value: unknown): CurrentDepartment[] {
  if (!Array.isArray(value)) throw unexpected();
  return value.map((item: unknown) => {
    if (
      !isRecord(item) ||
      typeof item['id'] !== 'string' ||
      typeof item['code'] !== 'string' ||
      typeof item['name'] !== 'string' ||
      typeof item['isPrimary'] !== 'boolean'
    ) {
      throw unexpected();
    }
    return { id: item['id'], code: item['code'], name: item['name'], isPrimary: item['isPrimary'] };
  });
}

function stringsOf(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw unexpected();
  }
  return value as string[];
}
