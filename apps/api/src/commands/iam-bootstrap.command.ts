import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { parseTraceId, type AuditRecorder } from '@vertex-os/audit';
import { createAuditRecorder } from '@vertex-os/audit-persistence';
import {
  createDatabaseClient,
  type DatabaseClient,
  type DatabaseTransaction,
} from '@vertex-os/database';
import { iamPermissionManifest, type BootstrapResult } from '@vertex-os/iam';
import type { DestinationStream } from 'pino';
import { createSessionStore } from '../auth/session-store.js';
import type { AppConfig } from '../config/app-config.js';
import type { IdentityProvisioningConfig } from '../config/identity-provisioning-config.js';
import { createIamBootstrap } from '../iam/user-administration.js';
import { createCommandLogger } from './iam-sync-reference.command.js';

/** Process exit codes of `pnpm iam:bootstrap` (IAM-R06 D-16). */
export const EXIT_COMPLETE = 0;
export const EXIT_FAILED = 1;
export const EXIT_REFUSED = 2;
/** Committed, but a Keycloak step did not complete; running the command again resumes it. */
export const EXIT_INCOMPLETE = 3;
/** The arguments were missing or malformed; nothing was read or written. */
export const EXIT_USAGE = 64;

/** Same bounds as reference synchronization: an operator run has no HTTP request to respect. */
const CONNECT_TIMEOUT_MS = 5_000;
const STATEMENT_TIMEOUT_MS = 5_000;

export const BOOTSTRAP_USAGE =
  'Usage: pnpm iam:bootstrap --email <address> --display-name <name> ' +
  '[--resend-invitation] [--recovery --reason <text>]';

export interface IamBootstrapOptions {
  /** Where the JSON log lines go; standard output when omitted. */
  readonly logDestination?: DestinationStream;
  /** Binds MOD-AUDIT's append capability to a transaction; the Audit adapter by default. */
  readonly auditRecorderFor?: (handle: DatabaseClient | DatabaseTransaction) => AuditRecorder;
  /** Replaces the global `fetch` of the Keycloak adapter, for tests that fault the transport. */
  readonly fetch?: typeof fetch;
}

interface BootstrapArguments {
  readonly email: string;
  readonly displayName: string;
  readonly recovery: boolean;
  readonly reason: string | undefined;
  readonly resendInvitation: boolean;
}

/** Parses the operator's arguments; `undefined` for anything missing, unknown or repeated. */
export function parseBootstrapArguments(argv: readonly string[]): BootstrapArguments | undefined {
  try {
    const { values, positionals } = parseArgs({
      args: [...argv],
      strict: true,
      allowPositionals: true,
      options: {
        email: { type: 'string' },
        'display-name': { type: 'string' },
        recovery: { type: 'boolean' },
        reason: { type: 'string' },
        'resend-invitation': { type: 'boolean' },
      },
    });
    const email = values.email;
    const displayName = values['display-name'];
    const recovery = values.recovery === true;
    if (positionals.length > 0 || email === undefined || displayName === undefined)
      return undefined;
    // A reason belongs to recovery, and recovery requires one (spec Section 21.3).
    if (recovery !== (values.reason !== undefined)) return undefined;
    return {
      email,
      displayName,
      recovery,
      reason: values.reason,
      resendInvitation: values['resend-invitation'] === true,
    };
  } catch {
    return undefined;
  }
}

function complete(result: Extract<BootstrapResult, { userId: unknown }>): boolean {
  return (
    result.identity.outcome === 'synced' &&
    result.invitation.outcome !== 'failed' &&
    result.invitation.outcome !== 'superseded' &&
    result.superseded.every(
      (superseded) => superseded.identity === undefined || superseded.identity.outcome === 'synced',
    )
  );
}

/**
 * `pnpm iam:bootstrap`: creates or resumes the first System Administrator, or recovers when no
 * ACTIVE one exists (spec Section 21). It logs exactly one result line, which names users by ID
 * only, never by email, and never carries a token, secret or the operator's reason. It never
 * creates credentials or an application session and never runs implicitly.
 */
export async function runIamBootstrap(
  config: AppConfig,
  provisioning: IdentityProvisioningConfig,
  argv: readonly string[],
  options: IamBootstrapOptions = {},
): Promise<number> {
  const logger = createCommandLogger(config, options.logDestination, 'iam:bootstrap');
  const traceId = parseTraceId(randomUUID());
  if (!traceId.ok) throw new Error('A generated UUID must be a valid trace ID.');
  const input = parseBootstrapArguments(argv);
  if (input === undefined) {
    logger.warn(
      { traceId: traceId.value, outcome: 'usage', usage: BOOTSTRAP_USAGE },
      'iam bootstrap usage',
    );
    return EXIT_USAGE;
  }
  const mode = input.recovery ? 'recovery' : 'normal';
  let database: DatabaseClient | undefined;
  try {
    database = createDatabaseClient({
      connectionString: config.database.url,
      connectTimeoutMs: CONNECT_TIMEOUT_MS,
      statementTimeoutMs: STATEMENT_TIMEOUT_MS,
    });
    const auditRecorderFor = options.auditRecorderFor ?? createAuditRecorder;
    const sessions = createSessionStore(database, { auditRecorderFor });
    const bootstrap = createIamBootstrap(provisioning, database, {
      auditRecorderFor,
      revokeUserSessions: (userId, reason, attribution) =>
        sessions.revokeUserSessions({ userId, reason, now: new Date(), attribution }),
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    });
    const result = await bootstrap({
      mode,
      email: input.email,
      displayName: input.displayName,
      ...(input.reason === undefined ? {} : { reason: input.reason }),
      resendInvitation: input.resendInvitation,
      manifests: [iamPermissionManifest],
      traceId: traceId.value,
    });
    const base = { traceId: traceId.value, mode };
    if (result.outcome === 'invalid') {
      logger.warn({ ...base, outcome: 'invalid', field: result.field }, 'iam bootstrap invalid');
      return EXIT_USAGE;
    }
    if (result.outcome === 'refused') {
      logger.warn({ ...base, outcome: 'refused', reason: result.reason }, 'iam bootstrap refused');
      return EXIT_REFUSED;
    }
    const done = complete(result);
    logger[done ? 'info' : 'warn'](
      {
        ...base,
        outcome: result.outcome,
        userId: result.userId,
        identity: result.identity,
        invitation: result.invitation,
        superseded: result.superseded,
      },
      done ? 'iam bootstrap completed' : 'iam bootstrap incomplete; run it again to resume',
    );
    return done ? EXIT_COMPLETE : EXIT_INCOMPLETE;
  } catch (error) {
    logger.error({ traceId: traceId.value, mode, err: error }, 'iam bootstrap failed');
    return EXIT_FAILED;
  } finally {
    await database?.disconnect();
  }
}
