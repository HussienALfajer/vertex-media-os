import { apiRequest, isRecord, NetworkFailure } from '../../lib/http';

/**
 * The IAM administration contract as the web application reads it (spec Sections 25.3–25.8;
 * IAM-R07 Section 5). Small type guards check the fields the screens use; an unexpected body is a
 * load failure, never an empty result (IAM-R08B D-05). State values stay strings: a value the
 * screens do not know is shown as an unknown status, never as success.
 */

export const ACCESS_STATES = ['INVITED', 'ACTIVE', 'SUSPENDED', 'DISABLED', 'TERMINATED'] as const;
export type AccessState = (typeof ACCESS_STATES)[number];

export interface UserDepartment {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly state: string;
  readonly isPrimary: boolean;
}

export interface UserRole {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly state: string;
  readonly isSystem: boolean;
}

/** A directory row: operational fields only (spec Section 42). */
export interface UserSummary {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly accessState: string;
  readonly identitySyncState: string;
  readonly invitationDeliveryState: string;
  readonly departments: readonly UserDepartment[];
  readonly roles: readonly UserRole[];
}

export interface User {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly accessState: string;
  readonly identitySyncState: string;
  readonly invitationDeliveryState: string;
  readonly invitationSentAt: string | null;
  readonly firstActivatedAt: string | null;
  readonly lastAccessStateChangedAt: string;
  readonly createdAt: string;
  readonly version: number;
}

export interface UserDetail extends User {
  readonly departments: readonly UserDepartment[];
  readonly roles: readonly UserRole[];
}

export interface Page<Item> {
  readonly items: readonly Item[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export interface Department {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly state: string;
}

export interface Role {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly state: string;
  readonly isSystem: boolean;
}

export type InvitationOutcome =
  'SENT' | 'FAILED' | 'NO_ACTION_REQUIRED' | 'NOT_APPLICABLE' | 'SUPERSEDED';

export type ProviderSessions = 'TERMINATED' | 'NO_IDENTITY' | 'FAILED';

export interface UserListParams {
  readonly page: number;
  readonly pageSize: number;
  readonly search?: string | undefined;
  readonly accessState?: AccessState | undefined;
}

// ---------------------------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------------------------

export async function listUsers(params: UserListParams, signal?: AbortSignal) {
  const query = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
  });
  if (params.search !== undefined && params.search !== '') query.set('search', params.search);
  if (params.accessState !== undefined) query.set('accessState', params.accessState);
  const body = await apiRequest(`/api/iam/users?${query.toString()}`, withSignal(signal));
  return pageOf(body, userSummaryOf);
}

export async function getUser(userId: string, signal?: AbortSignal): Promise<UserDetail> {
  const body = await apiRequest(`/api/iam/users/${encodeURIComponent(userId)}`, withSignal(signal));
  return userDetailOf(body);
}

/** One bounded page of ACTIVE departments for pickers (IAM-R08B D-12). */
export async function listActiveDepartments(signal?: AbortSignal) {
  const body = await apiRequest(
    '/api/iam/departments?state=ACTIVE&pageSize=100',
    withSignal(signal),
  );
  return pageOf(body, departmentOf);
}

/** One bounded page of ACTIVE roles for pickers (IAM-R08B D-12). */
export async function listActiveRoles(signal?: AbortSignal) {
  const body = await apiRequest('/api/iam/roles?state=ACTIVE&pageSize=100', withSignal(signal));
  return pageOf(body, roleOf);
}

// ---------------------------------------------------------------------------------------------
// Mutations (every one carries the in-memory CSRF token through `apiRequest`)
// ---------------------------------------------------------------------------------------------

export interface CreateUserInput {
  readonly email: string;
  readonly displayName: string;
  readonly memberships: readonly { readonly departmentId: string; readonly isPrimary: boolean }[];
  readonly roleIds: readonly string[];
}

export async function createUser(input: CreateUserInput): Promise<User> {
  const body = await apiRequest('/api/iam/users', {
    method: 'POST',
    body: {
      email: input.email,
      displayName: input.displayName,
      ...(input.memberships.length > 0 ? { memberships: input.memberships } : {}),
      ...(input.roleIds.length > 0 ? { roleIds: input.roleIds } : {}),
    },
  });
  if (!isRecord(body)) throw unexpected();
  return userOf(body['user']);
}

export async function updateDisplayName(
  userId: string,
  displayName: string,
  expectedVersion: number,
): Promise<User> {
  const body = await apiRequest(userPath(userId), {
    method: 'PATCH',
    body: { expectedVersion, displayName },
  });
  return userOf(body);
}

export type Restriction = 'suspend' | 'disable' | 'terminate';

export async function restrictUser(
  userId: string,
  restriction: Restriction,
  reason: string | undefined,
): Promise<{ readonly user: User; readonly sessionsRevoked: number }> {
  const body = await apiRequest(`${userPath(userId)}/${restriction}`, {
    method: 'POST',
    body: reasonBody(reason),
  });
  if (!isRecord(body) || typeof body['sessionsRevoked'] !== 'number') throw unexpected();
  return { user: userOf(body['user']), sessionsRevoked: body['sessionsRevoked'] };
}

export async function reactivateUser(
  userId: string,
  expectedVersion: number,
  reason: string | undefined,
): Promise<{ readonly user: User; readonly target: 'ACTIVE' | 'INVITED' }> {
  const body = await apiRequest(`${userPath(userId)}/reactivate`, {
    method: 'POST',
    body: { expectedVersion, ...reasonBody(reason) },
  });
  if (!isRecord(body) || (body['target'] !== 'ACTIVE' && body['target'] !== 'INVITED')) {
    throw unexpected();
  }
  return { user: userOf(body['user']), target: body['target'] };
}

export async function syncIdentity(userId: string) {
  return invitationResult(
    await apiRequest(`${userPath(userId)}/sync-identity`, { method: 'POST', body: {} }),
  );
}

export async function resendInvitation(userId: string) {
  return invitationResult(
    await apiRequest(`${userPath(userId)}/resend-invitation`, { method: 'POST', body: {} }),
  );
}

export async function revokeSessions(
  userId: string,
  reason: string | undefined,
): Promise<{ readonly sessionsRevoked: number; readonly providerSessions: ProviderSessions }> {
  const body = await apiRequest(`${userPath(userId)}/revoke-sessions`, {
    method: 'POST',
    body: reasonBody(reason),
  });
  const providerSessions = isRecord(body) ? body['providerSessions'] : undefined;
  if (
    !isRecord(body) ||
    typeof body['sessionsRevoked'] !== 'number' ||
    (providerSessions !== 'TERMINATED' &&
      providerSessions !== 'NO_IDENTITY' &&
      providerSessions !== 'FAILED')
  ) {
    throw unexpected();
  }
  return { sessionsRevoked: body['sessionsRevoked'], providerSessions };
}

export async function addMembership(
  userId: string,
  departmentId: string,
  isPrimary: boolean,
): Promise<void> {
  await apiRequest(`${userPath(userId)}/departments`, {
    method: 'POST',
    body: { departmentId, isPrimary },
  });
}

export async function setPrimaryMembership(userId: string, departmentId: string): Promise<void> {
  await apiRequest(`${userPath(userId)}/departments/${encodeURIComponent(departmentId)}`, {
    method: 'PATCH',
    body: { isPrimary: true },
  });
}

/** Removing the primary may name a replacement explicitly; the backend never guesses (spec 22). */
export async function removeMembership(
  userId: string,
  departmentId: string,
  replacementPrimaryDepartmentId: string | undefined,
): Promise<void> {
  const query =
    replacementPrimaryDepartmentId === undefined
      ? ''
      : `?${new URLSearchParams({ replacementPrimaryDepartmentId }).toString()}`;
  await apiRequest(`${userPath(userId)}/departments/${encodeURIComponent(departmentId)}${query}`, {
    method: 'DELETE',
  });
}

export async function assignRole(
  userId: string,
  roleId: string,
  reason: string | undefined,
): Promise<void> {
  await apiRequest(`${userPath(userId)}/roles`, {
    method: 'POST',
    body: { roleId, ...reasonBody(reason) },
  });
}

/** The reason travels in the body (IAM-R08B D-02). */
export async function removeRole(
  userId: string,
  roleId: string,
  reason: string | undefined,
): Promise<void> {
  const body = reasonBody(reason);
  await apiRequest(`${userPath(userId)}/roles/${encodeURIComponent(roleId)}`, {
    method: 'DELETE',
    ...(body.reason === undefined ? {} : { body }),
  });
}

// ---------------------------------------------------------------------------------------------
// Reading bodies
// ---------------------------------------------------------------------------------------------

function userPath(userId: string): `/api/${string}` {
  return `/api/iam/users/${encodeURIComponent(userId)}`;
}

function withSignal(signal: AbortSignal | undefined) {
  return signal === undefined ? {} : { signal };
}

/** An empty reason is no reason: the API refuses empty text (spec Section 53). */
function reasonBody(reason: string | undefined): { reason?: string } {
  const trimmed = reason?.trim();
  return trimmed === undefined || trimmed === '' ? {} : { reason: trimmed };
}

function unexpected(): NetworkFailure {
  return new NetworkFailure('Unexpected IAM response from the API');
}

function invitationResult(body: unknown): {
  readonly user: User;
  readonly invitation: InvitationOutcome;
} {
  const invitation = isRecord(body) ? body['invitation'] : undefined;
  if (
    !isRecord(body) ||
    (invitation !== 'SENT' &&
      invitation !== 'FAILED' &&
      invitation !== 'NO_ACTION_REQUIRED' &&
      invitation !== 'NOT_APPLICABLE' &&
      invitation !== 'SUPERSEDED')
  ) {
    throw unexpected();
  }
  return { user: userOf(body['user']), invitation };
}

function pageOf<Item>(body: unknown, item: (value: unknown) => Item): Page<Item> {
  if (
    !isRecord(body) ||
    !Array.isArray(body['items']) ||
    typeof body['page'] !== 'number' ||
    typeof body['pageSize'] !== 'number' ||
    typeof body['total'] !== 'number'
  ) {
    throw unexpected();
  }
  return {
    items: body['items'].map(item),
    page: body['page'],
    pageSize: body['pageSize'],
    total: body['total'],
  };
}

function text(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string') throw unexpected();
  return value;
}

function optionalText(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  if (value !== null && typeof value !== 'string') throw unexpected();
  return value;
}

function flag(record: Record<string, unknown>, key: string): boolean {
  const value = record[key];
  if (typeof value !== 'boolean') throw unexpected();
  return value;
}

function list<Item>(record: Record<string, unknown>, key: string, item: (value: unknown) => Item) {
  const value = record[key];
  if (!Array.isArray(value)) throw unexpected();
  return value.map(item);
}

function userDepartmentOf(value: unknown): UserDepartment {
  if (!isRecord(value)) throw unexpected();
  return {
    id: text(value, 'id'),
    code: text(value, 'code'),
    name: text(value, 'name'),
    state: text(value, 'state'),
    isPrimary: flag(value, 'isPrimary'),
  };
}

function userRoleOf(value: unknown): UserRole {
  if (!isRecord(value)) throw unexpected();
  return {
    id: text(value, 'id'),
    code: text(value, 'code'),
    name: text(value, 'name'),
    state: text(value, 'state'),
    isSystem: flag(value, 'isSystem'),
  };
}

function statesOf(value: Record<string, unknown>) {
  return {
    id: text(value, 'id'),
    email: text(value, 'email'),
    displayName: text(value, 'displayName'),
    accessState: text(value, 'accessState'),
    identitySyncState: text(value, 'identitySyncState'),
    invitationDeliveryState: text(value, 'invitationDeliveryState'),
  };
}

function userSummaryOf(value: unknown): UserSummary {
  if (!isRecord(value)) throw unexpected();
  return {
    ...statesOf(value),
    departments: list(value, 'departments', userDepartmentOf),
    roles: list(value, 'roles', userRoleOf),
  };
}

function userOf(value: unknown): User {
  if (!isRecord(value) || typeof value['version'] !== 'number') throw unexpected();
  return {
    ...statesOf(value),
    invitationSentAt: optionalText(value, 'invitationSentAt'),
    firstActivatedAt: optionalText(value, 'firstActivatedAt'),
    lastAccessStateChangedAt: text(value, 'lastAccessStateChangedAt'),
    createdAt: text(value, 'createdAt'),
    version: value['version'],
  };
}

function userDetailOf(value: unknown): UserDetail {
  if (!isRecord(value)) throw unexpected();
  return {
    ...userOf(value),
    departments: list(value, 'departments', userDepartmentOf),
    roles: list(value, 'roles', userRoleOf),
  };
}

function departmentOf(value: unknown): Department {
  if (!isRecord(value)) throw unexpected();
  return {
    id: text(value, 'id'),
    code: text(value, 'code'),
    name: text(value, 'name'),
    state: text(value, 'state'),
  };
}

function roleOf(value: unknown): Role {
  if (!isRecord(value)) throw unexpected();
  return { ...departmentOf(value), isSystem: flag(value, 'isSystem') };
}
