import type { AuditEntry, AuditRecorder } from '@vertex-os/audit';
import {
  factorActions,
  type ExternalIdentity,
  type IdentityProvider,
  type ProviderResult,
} from '../src/identity-provider.js';
import type {
  ApplicationUser,
  AuthorizationFacts,
  IamTransactionRunner,
  IamTransactionScope,
  NormalizedEmail,
  PermissionCode,
  RoleStore,
  UserId,
  UserIdentityStore,
  UserIdentityWriteResult,
  UserLifecycleStore,
} from '../src/persistence.js';

export const ISSUER = 'http://127.0.0.1:8080/realms/vertex';
export const USER_ID = '0d6f7a52-8f7e-4c2a-9a55-1f2b3c4d5e6f' as UserId;
export const OTHER_USER_ID = '7b0c1d2e-3f40-4a5b-8c6d-7e8f90a1b2c3' as UserId;
export const EMAIL = 'ada@example.test' as NormalizedEmail;

export function invitedUser(overrides: Partial<ApplicationUser> = {}): ApplicationUser {
  const at = new Date('2026-09-23T10:00:00.000Z');
  return {
    id: USER_ID,
    email: EMAIL,
    displayName: 'Ada' as ApplicationUser['displayName'],
    accessState: 'INVITED',
    identity: undefined,
    identitySyncState: 'PENDING',
    invitationDeliveryState: 'NOT_SENT',
    invitationSentAt: undefined,
    firstActivatedAt: undefined,
    lastAccessStateChangedAt: at,
    createdAt: at,
    updatedAt: at,
    version: 1,
    ...overrides,
  };
}

/**
 * Committed users plus an IAM transaction runner with transaction semantics: work runs on a copy
 * that commits only when the work resolves, and Audit entries commit with it. `beforeRun` lets a
 * test commit a competing change just before a transaction starts.
 */
export class InMemoryIam implements IamTransactionRunner {
  readonly users = new Map<UserId, ApplicationUser>();
  readonly audit: AuditEntry[] = [];
  readonly transactions: string[] = [];
  beforeRun: (() => void) | undefined;
  failAuditOnAction: string | undefined;
  /** What each user's roles grant (the grant ceiling's view of a target); nothing by default. */
  readonly grants = new Map<
    UserId,
    { holdsSystemAdministratorRole: boolean; activePermissionCodes: PermissionCode[] }
  >();
  /** Each actor's committed authorization facts; an unknown actor holds nothing. */
  readonly authorities = new Map<
    UserId,
    { facts: AuthorizationFacts; holdsSystemAdministratorRole: boolean }
  >();
  private clock = Date.parse('2026-09-23T12:00:00.000Z');

  constructor(...users: ApplicationUser[]) {
    for (const user of users) this.users.set(user.id, user);
  }

  get(id: UserId = USER_ID): ApplicationUser {
    const user = this.users.get(id);
    if (!user) throw new Error('unknown user');
    return user;
  }

  /** Commits a change as another operation would: new version, new state. */
  commit(change: Partial<ApplicationUser>, id: UserId = USER_ID): void {
    const user = this.get(id);
    this.users.set(id, { ...user, ...change, version: user.version + 1 });
  }

  readonly repository = {
    findById: async (id: UserId): Promise<ApplicationUser | undefined> => this.users.get(id),
    findByIdentity: async (identity: {
      issuer: string;
      subject: string;
    }): Promise<ApplicationUser | undefined> =>
      [...this.users.values()].find(
        (user) =>
          user.identity?.issuer === identity.issuer && user.identity.subject === identity.subject,
      ),
  };

  private queue: Promise<unknown> = Promise.resolve();

  /** Transactions run one at a time, as row locks would serialize these single-row writes. */
  run<T>(work: (scope: IamTransactionScope) => Promise<T>): Promise<T> {
    const result = this.queue.then(() => this.runNow(work));
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async runNow<T>(work: (scope: IamTransactionScope) => Promise<T>): Promise<T> {
    this.beforeRun?.();
    const staged = new Map(this.users);
    const entries: AuditEntry[] = [];
    const operations: string[] = [];
    const audit: AuditRecorder = {
      append: async (entry) => {
        if (entry.action === this.failAuditOnAction) throw new Error('audit append failed');
        entries.push(entry);
      },
    };
    const result = await work({
      referenceData: undefined as never,
      users: this.store(staged, operations),
      organization: undefined as never,
      roles: this.roles(operations),
      lifecycle: this.lifecycle(staged, operations),
      audit,
    });
    for (const [id, user] of staged) this.users.set(id, user);
    this.audit.push(...entries);
    this.transactions.push(operations.join('+'));
    return result;
  }

  /** The grant-ceiling reads only; role administration runs against PostgreSQL. */
  private roles(operations: string[]): RoleStore {
    const unsupported = async (): Promise<never> => {
      throw new Error('role administration runs against PostgreSQL');
    };
    return {
      createRole: unsupported,
      lockRole: unsupported,
      writeRole: unsupported,
      readRolePermissionCodes: unsupported,
      lockPermissions: unsupported,
      replaceRolePermissions: unsupported,
      lockUser: unsupported,
      hasAssignment: unsupported,
      insertAssignment: unsupported,
      deleteAssignment: unsupported,
      countActiveSystemAdministrators: unsupported,
      readActivePermissionCodes: unsupported,
      readActorAuthority: async (id) =>
        this.authorities.get(id) ?? { facts: undefined, holdsSystemAdministratorRole: false },
      readUserGrant: async (id) => {
        operations.push('read-grant');
        return (
          this.grants.get(id) ?? { holdsSystemAdministratorRole: false, activePermissionCodes: [] }
        );
      },
    };
  }

  /**
   * The user lifecycle writes without roles: no user holds the System Administrator role here
   * (last-administrator cases run against PostgreSQL).
   */
  private lifecycle(
    staged: Map<UserId, ApplicationUser>,
    operations: string[],
  ): UserLifecycleStore {
    const next = (): Date => {
      this.clock += 1000;
      return new Date(this.clock);
    };
    const locked = (id: UserId): ApplicationUser => {
      const user = staged.get(id);
      if (!user) throw new Error('unknown user');
      return user;
    };
    return {
      lockSystemAdministratorRole: async () => undefined,
      lockUser: async (id) => {
        operations.push('lock-user');
        return staged.get(id);
      },
      emailInUse: async (email) => [...staged.values()].some((user) => user.email === email),
      insertUser: async () => {
        throw new Error('creation runs against PostgreSQL');
      },
      writeAccessRestriction: async ({ id, expectedVersion, accessState }) => {
        operations.push(`restrict:${accessState}`);
        const user = locked(id);
        if (user.version !== expectedVersion) throw new Error('locked user changed');
        const at = next();
        const updated: ApplicationUser = {
          ...user,
          accessState,
          identitySyncState: 'PENDING',
          lastAccessStateChangedAt: at,
          updatedAt: at,
          version: user.version + 1,
        };
        staged.set(id, updated);
        return updated;
      },
      completeReactivation: async ({ id, expectedVersion, accessState }) => {
        operations.push(`reactivate:${accessState}`);
        const user = staged.get(id);
        if (!user) return { outcome: 'not-found' };
        if (
          user.version !== expectedVersion ||
          (user.accessState !== 'SUSPENDED' && user.accessState !== 'DISABLED')
        ) {
          return { outcome: 'version-conflict' };
        }
        const at = next();
        const updated: ApplicationUser = {
          ...user,
          accessState,
          identitySyncState: 'SYNCED',
          lastAccessStateChangedAt: at,
          updatedAt: at,
          version: user.version + 1,
        };
        staged.set(id, updated);
        return { outcome: 'updated', user: updated };
      },
      writeDisplayName: async ({ id, expectedVersion, displayName }) => {
        operations.push('display-name');
        const user = locked(id);
        if (user.version !== expectedVersion) throw new Error('locked user changed');
        const updated = { ...user, displayName, updatedAt: next(), version: user.version + 1 };
        staged.set(id, updated);
        return updated;
      },
      initializePasswordHash: async () => {
        throw new Error('Local credential initialization runs against PostgreSQL');
      },
      readRoleHolders: async () => [],
    };
  }

  private store(staged: Map<UserId, ApplicationUser>, operations: string[]): UserIdentityStore {
    const write = (
      id: UserId,
      expectedVersion: number,
      change: Partial<ApplicationUser>,
    ): UserIdentityWriteResult => {
      const user = staged.get(id);
      if (!user) return { outcome: 'not-found' };
      if (user.version !== expectedVersion) return { outcome: 'version-conflict' };
      this.clock += 1000;
      const updated = {
        ...user,
        ...change,
        version: user.version + 1,
        updatedAt: new Date(this.clock),
      };
      staged.set(id, updated);
      return { outcome: 'updated', user: updated };
    };
    return {
      bindIdentity: async ({ id, expectedVersion, issuer, subject }) => {
        operations.push('bind');
        const holder = [...staged.values()].find(
          (user) => user.identity?.issuer === issuer && user.identity.subject === subject,
        );
        if (holder && holder.id !== id) return { outcome: 'identity-taken' };
        if (staged.get(id)?.identity) return { outcome: 'version-conflict' };
        return write(id, expectedVersion, { identity: { issuer, subject } });
      },
      recordIdentitySync: async ({ id, expectedVersion, state }) => {
        operations.push(`sync:${state}`);
        return write(id, expectedVersion, { identitySyncState: state });
      },
      recordFirstActivation: async ({ id, expectedVersion }) => {
        operations.push('activate');
        if (staged.get(id)?.accessState !== 'INVITED' && staged.has(id)) {
          return { outcome: 'version-conflict' };
        }
        const at = new Date(this.clock + 1000);
        return write(id, expectedVersion, {
          accessState: 'ACTIVE',
          firstActivatedAt: at,
          lastAccessStateChangedAt: at,
        });
      },
      recordInvitationDelivery: async ({ id, expectedVersion, state }) => {
        operations.push(`invitation:${state}`);
        return write(
          id,
          expectedVersion,
          state === 'SENT'
            ? { invitationDeliveryState: state, invitationSentAt: new Date(this.clock + 1000) }
            : { invitationDeliveryState: state },
        );
      },
    };
  }
}

type Operation =
  | 'findBySubject'
  | 'findByUsername'
  | 'create'
  | 'setEnabled'
  | 'terminateSessions'
  | 'enrolledFactors'
  | 'sendInvitation';

interface StoredIdentity {
  subject: string;
  username: string;
  email: string;
  requiredActions: string[];
  enabled: boolean;
  emailVerified: boolean;
  vertexUserIds: string[];
  password: boolean;
  otp: boolean;
  sessions: number;
}

/**
 * An in-memory Keycloak with the port's semantics. Tests queue failures per operation, and the
 * call log shows which operations ran and in which order.
 */
export class FakeIdentityProvider implements IdentityProvider {
  readonly issuer = ISSUER;
  readonly identities = new Map<string, StoredIdentity>();
  readonly calls: string[] = [];
  readonly sent: { subject: string; lifespan: number }[] = [];
  private readonly failures = new Map<Operation, ('unavailable' | 'rejected')[]>();
  private readonly hooks = new Map<Operation, (() => void)[]>();
  private next = 0;
  /** Makes `create` store the identity and then report `unavailable`: a lost response. */
  loseCreateResponse = false;
  /** Makes `sendInvitation` answer `refused` or `not-found`. */
  sendOutcome: 'sent' | 'refused' | 'not-found' = 'sent';

  add(identity: Partial<StoredIdentity> & { username: string }): StoredIdentity {
    this.next += 1;
    const stored: StoredIdentity = {
      subject: `subject-${this.next}`,
      email: identity.username,
      requiredActions: [...factorActions],
      enabled: true,
      emailVerified: false,
      vertexUserIds: [],
      password: false,
      otp: false,
      sessions: 0,
      ...identity,
    };
    this.identities.set(stored.subject, stored);
    return stored;
  }

  failNext(operation: Operation, failure: 'unavailable' | 'rejected' = 'unavailable'): void {
    this.failures.set(operation, [...(this.failures.get(operation) ?? []), failure]);
  }

  /** Runs `hook` just before the next call of `operation` answers. */
  onNext(operation: Operation, hook: () => void): void {
    this.hooks.set(operation, [...(this.hooks.get(operation) ?? []), hook]);
  }

  mutatingCalls(): string[] {
    return this.calls.filter((call) => !/^(findBy|enrolledFactors)/.test(call));
  }

  private enter(
    operation: Operation,
    detail = '',
  ): { ok: false; failure: 'unavailable' | 'rejected' } | undefined {
    this.calls.push(detail ? `${operation}:${detail}` : operation);
    this.hooks.get(operation)?.shift()?.();
    const failure = this.failures.get(operation)?.shift();
    return failure ? { ok: false, failure } : undefined;
  }

  private view(identity: StoredIdentity): ExternalIdentity {
    return {
      subject: identity.subject,
      username: identity.username,
      email: identity.email,
      enabled: identity.enabled,
      emailVerified: identity.emailVerified,
      vertexUserIds: [...identity.vertexUserIds],
      requiredActions: [...identity.requiredActions],
    };
  }

  async findBySubject(subject: string): Promise<ProviderResult<ExternalIdentity | undefined>> {
    const failed = this.enter('findBySubject');
    if (failed) return failed;
    const identity = this.identities.get(subject);
    return { ok: true, value: identity && this.view(identity) };
  }

  async findByUsername(
    username: NormalizedEmail,
  ): Promise<ProviderResult<ExternalIdentity | undefined>> {
    const failed = this.enter('findByUsername');
    if (failed) return failed;
    const identity = [...this.identities.values()].find((item) => item.username === username);
    return { ok: true, value: identity && this.view(identity) };
  }

  async create(identity: { username: NormalizedEmail; vertexUserId: UserId }) {
    const failed = this.enter('create');
    if (failed) return failed;
    if ([...this.identities.values()].some((item) => item.username === identity.username)) {
      return { ok: true as const, value: { outcome: 'duplicate' as const } };
    }
    const stored = this.add({
      username: identity.username,
      vertexUserIds: [identity.vertexUserId],
    });
    if (this.loseCreateResponse) return { ok: false as const, failure: 'unavailable' as const };
    return { ok: true as const, value: { outcome: 'created' as const, subject: stored.subject } };
  }

  async setEnabled(subject: string, enabled: boolean) {
    const failed = this.enter('setEnabled', String(enabled));
    if (failed) return failed;
    const identity = this.identities.get(subject);
    if (!identity) return { ok: true as const, value: 'not-found' as const };
    identity.enabled = enabled;
    return { ok: true as const, value: 'updated' as const };
  }

  async terminateSessions(subject: string) {
    const failed = this.enter('terminateSessions');
    if (failed) return failed;
    const identity = this.identities.get(subject);
    if (!identity) return { ok: true as const, value: 'not-found' as const };
    identity.sessions = 0;
    return { ok: true as const, value: 'terminated' as const };
  }

  async enrolledFactors(subject: string) {
    const failed = this.enter('enrolledFactors');
    if (failed) return failed;
    const identity = this.identities.get(subject);
    if (!identity) return { ok: true as const, value: 'not-found' as const };
    return { ok: true as const, value: { password: identity.password, otp: identity.otp } };
  }

  async sendInvitation(subject: string, request: { lifespanSeconds: number }) {
    const failed = this.enter('sendInvitation');
    if (failed) return failed;
    if (this.sendOutcome !== 'sent') return { ok: true as const, value: this.sendOutcome };
    if (!this.identities.has(subject)) return { ok: true as const, value: 'not-found' as const };
    this.sent.push({ subject, lifespan: request.lifespanSeconds });
    return { ok: true as const, value: 'sent' as const };
  }
}
