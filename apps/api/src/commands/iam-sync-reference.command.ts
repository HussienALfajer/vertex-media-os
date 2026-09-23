import { randomUUID } from 'node:crypto';
import { parseTraceId, type AuditRecorder } from '@vertex-os/audit';
import { createAuditRecorder } from '@vertex-os/audit-persistence';
import {
  createDatabaseClient,
  type DatabaseClient,
  type DatabaseTransaction,
} from '@vertex-os/database';
import { iamPermissionManifest, synchronizeIamReferenceData } from '@vertex-os/iam';
import { createIamTransactionRunner } from '@vertex-os/iam-persistence';
import { pino, type DestinationStream, type Logger } from 'pino';
import { type AppConfig } from '../config/app-config.js';
import { safeErrorSerializer } from '../logging/safe-error-serializer.js';

/** Process exit codes of `pnpm iam:sync-reference`. */
export const EXIT_SYNCHRONIZED = 0;
export const EXIT_FAILED = 1;
export const EXIT_REFUSED = 2;

/**
 * An operator run has no HTTP request bounds to respect, so connection and statement bounds are
 * generous; a run takes milliseconds, and waiting for a concurrent run's advisory lock is bounded
 * by the statement timeout.
 */
const CONNECT_TIMEOUT_MS = 5_000;
const STATEMENT_TIMEOUT_MS = 5_000;

export interface IamReferenceSyncOptions {
  /** Where the JSON log lines go; standard output when omitted. */
  readonly logDestination?: DestinationStream;
  /** Binds MOD-AUDIT's append capability to the run's transaction; the Audit adapter by default. */
  readonly auditRecorderFor?: (handle: DatabaseClient | DatabaseTransaction) => AuditRecorder;
}

/** The command's structured logger: same format as the API's, with the safe `err` serializer. */
export function createCommandLogger(config: AppConfig, destination?: DestinationStream): Logger {
  const options = {
    level: config.logging.level,
    base: { command: 'iam:sync-reference' },
    serializers: { err: safeErrorSerializer },
  };
  return destination ? pino(options, destination) : pino(options);
}

/**
 * Converges the database to the code-defined IAM permission catalog and the protected System
 * Administrator role (IAM-02 D-16), logs exactly one result line and returns the process exit
 * code: 0 synchronized (with or without changes), 2 refused, 1 unexpected failure. It never logs
 * the connection string, and it is never run implicitly (not on API start, not in a migration).
 */
export async function runIamReferenceSync(
  config: AppConfig,
  options: IamReferenceSyncOptions = {},
): Promise<number> {
  const logger = createCommandLogger(config, options.logDestination);
  const traceId = parseTraceId(randomUUID());
  if (!traceId.ok) throw new Error('A generated UUID must be a valid trace ID.');
  let database: DatabaseClient | undefined;
  try {
    database = createDatabaseClient({
      connectionString: config.database.url,
      connectTimeoutMs: CONNECT_TIMEOUT_MS,
      statementTimeoutMs: STATEMENT_TIMEOUT_MS,
    });
    const runner = createIamTransactionRunner(database, {
      auditRecorderFor: options.auditRecorderFor ?? createAuditRecorder,
    });
    const result = await synchronizeIamReferenceData(
      { runner },
      { manifests: [iamPermissionManifest], traceId: traceId.value },
    );
    if (result.outcome === 'refused') {
      logger.warn(
        {
          traceId: traceId.value,
          outcome: result.outcome,
          reason: result.reason,
          details: result.details,
        },
        'iam reference data synchronization refused',
      );
      return EXIT_REFUSED;
    }
    const { changes } = result;
    logger.info(
      {
        traceId: traceId.value,
        outcome: result.outcome,
        counts: {
          permissionsRegistered: changes.permissionsRegistered.length,
          permissionsUpdated: changes.permissionsUpdated.length,
          permissionsGranted: changes.permissionsGranted.length,
          permissionsRevoked: changes.permissionsRevoked.length,
        },
        changes,
      },
      'iam reference data synchronized',
    );
    return EXIT_SYNCHRONIZED;
  } catch (error) {
    logger.error(
      { traceId: traceId.value, err: error },
      'iam reference data synchronization failed',
    );
    return EXIT_FAILED;
  } finally {
    await database?.disconnect();
  }
}
