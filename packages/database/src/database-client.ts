import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

export interface DatabaseClientOptions {
  /** PostgreSQL connection string (`postgresql://…`). Treated as a secret: never logged. */
  readonly connectionString: string;
  /**
   * Upper bound for obtaining a connection: opening a new one (DNS, TCP, TLS, authentication) or
   * waiting for a pooled one to become free.
   */
  readonly connectTimeoutMs?: number;
  /**
   * Upper bound for a single statement, enforced where the work happens rather than by a caller
   * that merely stops waiting: PostgreSQL cancels a statement that runs longer
   * (`statement_timeout`), and the driver abandons a statement the server does not answer at all
   * and discards its connection (`query_timeout`), so a timed-out statement never keeps a
   * connection busy.
   */
  readonly statementTimeoutMs?: number;
}

/**
 * The narrow infrastructure surface the API needs from PostgreSQL in Phase 0.
 * Prisma remains an implementation detail behind this boundary; domain modules
 * will receive their own persistence capabilities when they are specified.
 */
export interface DatabaseClient {
  /**
   * Executes a trivial round trip and resolves only when PostgreSQL answered. Otherwise rejects
   * with a {@link DatabaseUnavailableError} within the configured connect and statement bounds.
   */
  ping(): Promise<void>;
  /** Releases pooled connections. Safe to call more than once. */
  disconnect(): Promise<void>;
}

/**
 * PostgreSQL did not answer. Carries only facts that are safe to log. The driver's own error is
 * deliberately neither kept as `cause` nor quoted: its message embeds host names, ports, user and
 * database names, and generic error serializers print the whole cause chain.
 */
export class DatabaseUnavailableError extends Error {
  override readonly name = 'DatabaseUnavailableError';

  constructor(
    /**
     * Driver failure category such as `DatabaseNotReachable` or `AuthenticationFailed`;
     * `Unclassified` when the driver gives none (timeouts, for example).
     */
    readonly reason: string,
    /** PostgreSQL SQLSTATE (for example `28P01`) when the server itself reported the failure. */
    readonly sqlState: string | undefined,
  ) {
    super(`PostgreSQL is unavailable (${reason}).`);
  }
}

const DEFAULT_CONNECT_TIMEOUT_MS = 5_000;
const DEFAULT_STATEMENT_TIMEOUT_MS = 5_000;

export function createDatabaseClient(options: DatabaseClientOptions): DatabaseClient {
  const statementTimeoutMs = options.statementTimeoutMs ?? DEFAULT_STATEMENT_TIMEOUT_MS;
  const adapter = new PrismaPg({
    connectionString: options.connectionString,
    connectionTimeoutMillis: options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS,
    statement_timeout: statementTimeoutMs,
    query_timeout: statementTimeoutMs,
  });
  const prisma = new PrismaClient({ adapter });

  return {
    async ping(): Promise<void> {
      try {
        await prisma.$queryRaw`SELECT 1`;
      } catch (error) {
        const failure = driverFailure(error);
        throw new DatabaseUnavailableError(
          matching(failure?.['kind'], FAILURE_KIND) ?? 'Unclassified',
          matching(failure?.['originalCode'], SQLSTATE),
        );
      }
    },
    async disconnect(): Promise<void> {
      await prisma.$disconnect();
    },
  };
}

const FAILURE_KIND = /^[A-Za-z]{1,64}$/;
const SQLSTATE = /^[0-9A-Z]{5}$/;

/**
 * The driver adapter's classification of a failed query, which Prisma exposes as
 * `meta.driverAdapterError.cause` (`{ kind, originalCode?, … }`).
 */
function driverFailure(error: unknown): Record<string, unknown> | undefined {
  const cause = field(field(field(error, 'meta'), 'driverAdapterError'), 'cause');
  return isRecord(cause) ? cause : undefined;
}

function field(value: unknown, name: string): unknown {
  return isRecord(value) ? value[name] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** The value, only when it is a string of the expected shape (so it cannot smuggle in free text). */
function matching(value: unknown, pattern: RegExp): string | undefined {
  return typeof value === 'string' && pattern.test(value) ? value : undefined;
}
