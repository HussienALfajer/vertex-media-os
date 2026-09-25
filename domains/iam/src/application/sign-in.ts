import {
  createAuditEntry,
  parseSystemProcess,
  userActor,
  type AuditActor,
  type AuditChangeSide,
  type AuditRecorder,
  type TraceId,
} from '@vertex-os/audit';
import type { ApplicationUser } from '../domain/application-user.js';
import { parseUserId, type UserId } from '../domain/identifiers.js';
import type { NormalizedEmail } from '../domain/email.js';
import type { DisplayName } from '../domain/text.js';
import { MAX_ATTEMPTS, RETRY } from './identity-provisioning-dependencies.js';
import type { ApplicationUserRepository } from './ports/application-user-repository.js';
import type { IamTransactionRunner } from './ports/iam-transaction.js';

/** What sign-in resolution needs; composition supplies it. */
export interface SignInDependencies {
  /** Reads committed users outside any transaction. */
  readonly users: Pick<ApplicationUserRepository, 'findByIdentity' | 'findById'>;
  readonly runner: IamTransactionRunner;
}

/** A validated identity-provider identity and the request it arrived with. */
export interface SignInRequest {
  readonly issuer: string;
  readonly subject: string;
  readonly traceId: TraceId;
}

export type SignInResult =
  /** The user may receive an application session. */
  | { readonly outcome: 'signed-in'; readonly userId: UserId; readonly firstActivation: boolean }
  /** No Vertex user is bound to this identity; nothing was created. */
  | { readonly outcome: 'unmapped' }
  /** The bound user is SUSPENDED, DISABLED or TERMINATED. */
  | { readonly outcome: 'inactive' }
  /** Competing changes kept winning; the sign-in is denied (fail closed). */
  | { readonly outcome: 'conflict' };

/** The user context a valid application session may expose (spec Section 25.1). */
export interface SessionUser {
  readonly id: UserId;
  readonly email: NormalizedEmail;
  readonly displayName: DisplayName;
}

export type ResolveSessionUserResult =
  | { readonly outcome: 'active'; readonly user: SessionUser }
  | { readonly outcome: 'inactive' }
  | { readonly outcome: 'not-found' };

type Attempt = SignInResult | typeof RETRY;

const SIGN_IN_PROCESS = parseSystemProcess('iam.sign-in');
/** Subjects outside the Audit target-ID grammar are recorded under this fixed identifier. */
const INVALID_SUBJECT = 'invalid';
const TARGET_ID = /^[a-z0-9]([a-z0-9._-]{0,126}[a-z0-9])?$/;

/**
 * Sign-in resolution (spec Section 13 steps 8–10). IAM resolves exactly one user by issuer and
 * subject, never by email or any other claim, and only `accessState` decides access: identity
 * synchronization and invitation delivery states never do (IAM-R03 D-09).
 *
 * - Unmapped identity: denied, with REFUSED Audit evidence; no user is created.
 * - SUSPENDED, DISABLED, TERMINATED: denied. Keycloak evidently still authenticates the identity,
 *   so `identitySyncState` becomes FAILED (unless already FAILED) with REFUSED Audit evidence in
 *   the same transaction, which makes the mismatch visible to reconciliation.
 * - INVITED: first activation, a version-checked INVITED → ACTIVE write with its Audit evidence.
 * - ACTIVE: signed in.
 *
 * A lost optimistic-concurrency race re-reads the committed user and applies the same rules to it,
 * at most three times; `firstActivatedAt` is never overwritten and a concurrent restriction always
 * wins. After that the sign-in is denied as `conflict`.
 */
export async function signIn(
  dependencies: SignInDependencies,
  request: SignInRequest,
): Promise<SignInResult> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const user = await dependencies.users.findByIdentity({
      issuer: request.issuer,
      subject: request.subject,
    });
    const result =
      user === undefined
        ? await refuseUnmapped(dependencies, request)
        : await decide(dependencies, user, request.traceId);
    if (result !== RETRY) return result;
  }
  return { outcome: 'conflict' };
}

/**
 * The user behind a live application session, read from committed IAM state on every use so a
 * restriction takes effect on the next request (spec Section 14; invariant 11). Only ACTIVE users
 * may use a session.
 */
export async function resolveSessionUser(
  dependencies: { readonly users: Pick<ApplicationUserRepository, 'findById'> },
  userId: string,
): Promise<ResolveSessionUserResult> {
  const id = parseUserId(userId);
  if (!id.ok) return { outcome: 'not-found' };
  const user = await dependencies.users.findById(id.value);
  if (user === undefined) return { outcome: 'not-found' };
  if (user.accessState !== 'ACTIVE') return { outcome: 'inactive' };
  return {
    outcome: 'active',
    user: { id: user.id, email: user.email, displayName: user.displayName },
  };
}

/**
 * The user bound to an identity, for identity-provider signals that name a subject rather than a
 * session (back-channel logout, spec Section 33). Issuer and subject together, nothing else.
 */
export async function resolveIdentityUser(
  dependencies: { readonly users: Pick<ApplicationUserRepository, 'findByIdentity'> },
  identity: { readonly issuer: string; readonly subject: string },
): Promise<UserId | undefined> {
  return (await dependencies.users.findByIdentity(identity))?.id;
}

async function decide(
  dependencies: SignInDependencies,
  user: ApplicationUser,
  traceId: TraceId,
): Promise<Attempt> {
  switch (user.accessState) {
    case 'ACTIVE':
      return { outcome: 'signed-in', userId: user.id, firstActivation: false };
    case 'INVITED':
      return activate(dependencies, user, traceId);
    case 'SUSPENDED':
    case 'DISABLED':
    case 'TERMINATED':
      return refuseInactive(dependencies, user, traceId);
  }
}

async function activate(
  dependencies: SignInDependencies,
  user: ApplicationUser,
  traceId: TraceId,
): Promise<Attempt> {
  return dependencies.runner.run(async (scope) => {
    const written = await scope.users.recordFirstActivation({
      id: user.id,
      expectedVersion: user.version,
    });
    if (written.outcome !== 'updated') return RETRY;
    await append(scope.audit, {
      action: 'iam.user.first-activated',
      actor: actorOf(user.id),
      target: { type: 'iam.user', id: user.id },
      result: 'SUCCEEDED',
      traceId,
      change: {
        before: { accessState: user.accessState },
        after: { accessState: written.user.accessState },
      },
    });
    return { outcome: 'signed-in', userId: user.id, firstActivation: true };
  });
}

async function refuseInactive(
  dependencies: SignInDependencies,
  user: ApplicationUser,
  traceId: TraceId,
): Promise<Attempt> {
  return dependencies.runner.run(async (scope) => {
    await append(scope.audit, {
      action: 'iam.user.sign-in-refused',
      actor: actorOf(user.id),
      target: { type: 'iam.user', id: user.id },
      result: 'REFUSED',
      traceId,
      change: {
        before: { accessState: user.accessState, identitySyncState: user.identitySyncState },
        after: { accessState: user.accessState, identitySyncState: user.identitySyncState },
      },
    });
    return { outcome: 'inactive' };
  });
}

async function refuseUnmapped(
  dependencies: SignInDependencies,
  request: SignInRequest,
): Promise<SignInResult> {
  if (!SIGN_IN_PROCESS.ok) throw new Error('Sign-in has an invalid system process code.');
  const actor: AuditActor = { type: 'SYSTEM', process: SIGN_IN_PROCESS.value };
  await dependencies.runner.run((scope) =>
    append(scope.audit, {
      action: 'iam.identity.sign-in-refused',
      actor,
      target: {
        type: 'iam.identity',
        id: TARGET_ID.test(request.subject) ? request.subject : INVALID_SUBJECT,
      },
      result: 'REFUSED',
      traceId: request.traceId,
    }),
  );
  return { outcome: 'unmapped' };
}

function actorOf(userId: UserId): AuditActor {
  const actor = userActor(userId);
  if (!actor.ok) throw new Error('Sign-in resolved a user with an invalid identifier.');
  return actor.value;
}

async function append(
  audit: AuditRecorder,
  entry: {
    readonly action: string;
    readonly actor: AuditActor;
    readonly target: { readonly type: string; readonly id: string };
    readonly result: 'SUCCEEDED' | 'REFUSED';
    readonly traceId: TraceId;
    readonly change?: { readonly before?: AuditChangeSide; readonly after?: AuditChangeSide };
  },
): Promise<void> {
  const built = createAuditEntry({ sourceModule: 'iam', ...entry });
  // An invalid entry is a programming error: throwing rolls the state write back (spec Section 50).
  if (!built.ok) throw new Error(`Sign-in built an invalid audit entry (${built.reason}).`);
  await audit.append(built.value);
}
