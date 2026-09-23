import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from './generated/prisma/client.js';

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

declare const transactionBrand: unique symbol;

/**
 * Opaque handle for one open database transaction, created only by `runInTransaction` and valid
 * only until the work it was passed to settles. It carries no methods and no Prisma type, so
 * adapter factories can accept it in Prisma-free signatures; only the domain-scoped persistence
 * entries turn it back into a client.
 */
export interface DatabaseTransaction {
  readonly [transactionBrand]: 'DatabaseTransaction';
}

export interface TransactionOptions {
  /** `ReadCommitted` unless a use case needs `Serializable`. */
  readonly isolationLevel?: 'ReadCommitted' | 'Serializable';
  /** Upper bound for the whole transaction, measured from its start. */
  readonly timeoutMs?: number;
  /** Upper bound for obtaining a connection to start the transaction. */
  readonly maxWaitMs?: number;
}

const DEFAULT_CONNECT_TIMEOUT_MS = 5_000;
const DEFAULT_STATEMENT_TIMEOUT_MS = 5_000;
// Prisma's own interactive-transaction defaults, stated so they are reviewed choices.
const DEFAULT_TRANSACTION_TIMEOUT_MS = 5_000;
const DEFAULT_TRANSACTION_MAX_WAIT_MS = 2_000;

const persistenceClients = new WeakMap<DatabaseClient, PrismaClient>();
const openTransactions = new WeakMap<DatabaseTransaction, Prisma.TransactionClient>();
const issuedTransactions = new WeakSet<DatabaseTransaction>();

export function createDatabaseClient(options: DatabaseClientOptions): DatabaseClient {
  const statementTimeoutMs = options.statementTimeoutMs ?? DEFAULT_STATEMENT_TIMEOUT_MS;
  const adapter = new PrismaPg({
    connectionString: options.connectionString,
    connectionTimeoutMillis: options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS,
    statement_timeout: statementTimeoutMs,
    query_timeout: statementTimeoutMs,
  });
  const prisma = new PrismaClient({ adapter });

  const database: DatabaseClient = {
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
  persistenceClients.set(database, prisma);
  return database;
}

function prismaOf(database: DatabaseClient): PrismaClient {
  const client = persistenceClients.get(database);
  if (!client) throw new TypeError('DatabaseClient was not created by createDatabaseClient.');
  return client;
}

/**
 * Runs `work` in one interactive transaction on the client's pool. The handle passed to `work` is
 * valid only until `work` settles; the transaction commits when it resolves and rolls back when it
 * rejects. Exported only from the domain-scoped entries, never from the package root: adapters
 * open transactions, composition roots only wire them.
 */
export async function runInTransaction<T>(
  database: DatabaseClient,
  work: (transaction: DatabaseTransaction) => Promise<T>,
  options: TransactionOptions = {},
): Promise<T> {
  return prismaOf(database).$transaction(
    async (client) => {
      const transaction = Object.freeze(Object.create(null) as DatabaseTransaction);
      issuedTransactions.add(transaction);
      openTransactions.set(transaction, client);
      try {
        return await work(transaction);
      } finally {
        openTransactions.delete(transaction);
      }
    },
    {
      isolationLevel:
        options.isolationLevel === 'Serializable'
          ? Prisma.TransactionIsolationLevel.Serializable
          : Prisma.TransactionIsolationLevel.ReadCommitted,
      timeout: options.timeoutMs ?? DEFAULT_TRANSACTION_TIMEOUT_MS,
      maxWait: options.maxWaitMs ?? DEFAULT_TRANSACTION_MAX_WAIT_MS,
    },
  );
}

type RawSqlMethods = '$queryRaw' | '$executeRaw' | '$queryRawUnsafe' | '$executeRawUnsafe';

/**
 * The part of a (transaction) client one domain may use: the model delegates whose names start
 * with the domain's prefix, plus raw SQL. Transaction control and connection lifecycle
 * (`$transaction`, `$connect`, `$disconnect`, `$on`, `$extends`) are absent, and so is every other
 * domain's model. A model added later joins its domain's scope through its prefix.
 */
export type DomainScopedClient<Prefix extends string> = Pick<
  Prisma.TransactionClient,
  Extract<keyof Prisma.TransactionClient, `${Prefix}${string}`> | RawSqlMethods
>;

/**
 * The Prisma client behind a handle: the pooled client of a {@link DatabaseClient}, or the
 * transaction client of an open {@link DatabaseTransaction}. Throws `TypeError` for a handle this
 * package did not create and for a transaction handle whose transaction has ended. The
 * domain-scoped entries narrow its type; the package root never re-exports it.
 */
export function prismaClientOf(
  handle: DatabaseClient | DatabaseTransaction,
): Prisma.TransactionClient {
  const transaction = openTransactions.get(handle as DatabaseTransaction);
  if (transaction) return transaction;
  if (issuedTransactions.has(handle as DatabaseTransaction)) {
    throw new TypeError('DatabaseTransaction has already ended.');
  }
  return prismaOf(handle as DatabaseClient);
}

const FAILURE_KIND = /^[A-Za-z]{1,64}$/;
const SQLSTATE = /^[0-9A-Z]{5}$/;
const PRISMA_CODE = /^P\d{4}$/;
const SQL_IDENTIFIER = /^[a-z_][a-z0-9_$]{0,62}$/;
const MODEL_NAME = /^[A-Za-z][A-Za-z0-9]{0,63}$/;

/**
 * The only facts about a database error that may be logged (IAM-02 D-15). Every field matches a
 * strict shape; messages, `detail`, `originalMessage`, `meta` and stacks are never included,
 * because they carry row data (a whole failing row, emails included) and raw input values.
 */
export interface DatabaseErrorDescription {
  readonly errorClass:
    | 'PrismaClientKnownRequestError'
    | 'PrismaClientUnknownRequestError'
    | 'PrismaClientValidationError'
    | 'PrismaClientInitializationError'
    | 'PrismaClientRustPanicError'
    | 'DatabaseUnavailableError';
  /** Prisma error code, e.g. `P2002`. */
  readonly prismaCode?: string;
  /** PostgreSQL SQLSTATE, e.g. `23505`. */
  readonly sqlState?: string;
  /** The driver adapter's failure category, e.g. `UniqueConstraintViolation`. */
  readonly driverKind?: string;
  /** Constraint or index name when the driver reports it structurally. */
  readonly constraint?: string;
  readonly table?: string;
  /** Prisma model name of the failed operation. */
  readonly model?: string;
  /** `DatabaseUnavailableError` category, e.g. `DatabaseNotReachable`. */
  readonly reason?: string;
}

function optional<K extends string>(key: K, value: string | undefined): Partial<Record<K, string>> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, string>);
}

/**
 * Describes a database error with allowlisted facts only, or returns `undefined` when the value is
 * not a database error. Knowledge of Prisma's error shapes stays in this package; loggers call this
 * instead of serializing the error itself.
 */
export function describeDatabaseError(error: unknown): DatabaseErrorDescription | undefined {
  if (error instanceof DatabaseUnavailableError) {
    return {
      errorClass: 'DatabaseUnavailableError',
      ...optional('reason', matching(error.reason, FAILURE_KIND)),
      ...optional('sqlState', matching(error.sqlState, SQLSTATE)),
    };
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const failure = driverFailure(error);
    const constraint = failure?.['constraint'];
    return {
      errorClass: 'PrismaClientKnownRequestError',
      ...optional('prismaCode', matching(error.code, PRISMA_CODE)),
      ...optional(
        'sqlState',
        matching(failure?.['originalCode'], SQLSTATE) ?? matching(failure?.['code'], SQLSTATE),
      ),
      ...optional('driverKind', matching(failure?.['kind'], FAILURE_KIND)),
      ...optional(
        'constraint',
        matching(field(constraint, 'index'), SQL_IDENTIFIER) ??
          matching(constraint, SQL_IDENTIFIER),
      ),
      ...optional('table', matching(failure?.['table'], SQL_IDENTIFIER)),
      ...optional('model', matching(field(error.meta, 'modelName'), MODEL_NAME)),
    };
  }
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    return { errorClass: 'PrismaClientUnknownRequestError' };
  }
  if (error instanceof Prisma.PrismaClientValidationError) {
    return { errorClass: 'PrismaClientValidationError' };
  }
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return {
      errorClass: 'PrismaClientInitializationError',
      ...optional('prismaCode', matching(error.errorCode, PRISMA_CODE)),
    };
  }
  if (error instanceof Prisma.PrismaClientRustPanicError) {
    return { errorClass: 'PrismaClientRustPanicError' };
  }
  return undefined;
}

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
