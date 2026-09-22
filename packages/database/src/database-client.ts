import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

export interface DatabaseClientOptions {
  /** PostgreSQL connection string (`postgresql://…`). Treated as a secret: never logged. */
  readonly connectionString: string;
  /**
   * Upper bound for establishing a new connection. Keeps readiness checks bounded
   * when the database host is unreachable rather than merely refusing connections.
   */
  readonly connectTimeoutMs?: number;
}

/**
 * The narrow infrastructure surface the API needs from PostgreSQL in Phase 0.
 * Prisma remains an implementation detail behind this boundary; domain modules
 * will receive their own persistence capabilities when they are specified.
 */
export interface DatabaseClient {
  /** Executes a trivial round trip and resolves only when PostgreSQL answered. */
  ping(): Promise<void>;
  /** Releases pooled connections. Safe to call more than once. */
  disconnect(): Promise<void>;
}

const DEFAULT_CONNECT_TIMEOUT_MS = 5_000;

export function createDatabaseClient(options: DatabaseClientOptions): DatabaseClient {
  const adapter = new PrismaPg({
    connectionString: options.connectionString,
    connectionTimeoutMillis: options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS,
  });
  const prisma = new PrismaClient({ adapter });

  return {
    async ping(): Promise<void> {
      await prisma.$queryRaw`SELECT 1`;
    },
    async disconnect(): Promise<void> {
      await prisma.$disconnect();
    },
  };
}
