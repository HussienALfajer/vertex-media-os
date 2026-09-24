import { Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { createDatabaseClient, type DatabaseClient } from '@vertex-os/database';
import { type AppConfig } from '../config/app-config.js';
import { APP_CONFIG } from '../config/config.module.js';

/** Injection token for the process-wide {@link DatabaseClient}. */
export const DATABASE_CLIENT = Symbol('DATABASE_CLIENT');

/**
 * `GET /api/health/ready` answers within about three seconds even when PostgreSQL is unreachable
 * or stalled, and nothing the check started is still running once it has answered. Sign-in and
 * session statements (IAM-R03 D-21) are key lookups and single-row writes; session housekeeping
 * (IAM-R09 D-06) changes batches of 200 rows found through the idle-deadline index, so the same
 * bounds hold for them. The IAM directory's searches (IAM-R07 D-03)
 * scan small tables (spec Section 51) one bounded page at a time, so the bounds stay; a statement
 * that exceeds them answers `503 SERVICE_BUSY` (D-15). Revisit these values when a module adds
 * queries that scan large tables (reports).
 */
const CONNECT_TIMEOUT_MS = 2_000;
const STATEMENT_TIMEOUT_MS = 1_000;

/**
 * Provides the single PostgreSQL client of the API process and releases its
 * connection pool on shutdown. Connections are opened lazily on first use.
 */
@Module({
  providers: [
    {
      provide: DATABASE_CLIENT,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): DatabaseClient =>
        createDatabaseClient({
          connectionString: config.database.url,
          connectTimeoutMs: CONNECT_TIMEOUT_MS,
          statementTimeoutMs: STATEMENT_TIMEOUT_MS,
        }),
    },
  ],
  exports: [DATABASE_CLIENT],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  async onApplicationShutdown(): Promise<void> {
    await this.database.disconnect();
  }
}
