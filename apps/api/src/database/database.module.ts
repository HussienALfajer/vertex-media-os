import { Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { createDatabaseClient, type DatabaseClient } from '@vertex-os/database';
import { type AppConfig } from '../config/app-config.js';
import { APP_CONFIG } from '../config/config.module.js';

/** Injection token for the process-wide {@link DatabaseClient}. */
export const DATABASE_CLIENT = Symbol('DATABASE_CLIENT');

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
        createDatabaseClient({ connectionString: config.database.url }),
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
