import { type DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import type { DatabaseClient } from '@vertex-os/database';
import type { AuthConfig } from '../config/auth-config.js';
import { DATABASE_CLIENT, DatabaseModule } from '../database/database.module.js';
import { AuthController } from './auth.controller.js';
import { createAuthRuntime, type AuthRuntimeOptions } from './auth-runtime.js';
import { AUTH_RUNTIME, CsrfGuard } from './csrf.guard.js';

/**
 * Browser authentication (IAM-R03): the BFF endpoints and the global CSRF guard, composed over the
 * process's database client. Platform infrastructure, not an IAM domain module (spec Section 6.2).
 */
@Module({})
export class AuthModule {
  static forRoot(config: AuthConfig, options: AuthRuntimeOptions = {}): DynamicModule {
    return {
      module: AuthModule,
      imports: [DatabaseModule],
      controllers: [AuthController],
      providers: [
        {
          provide: AUTH_RUNTIME,
          inject: [DATABASE_CLIENT],
          useFactory: (database: DatabaseClient) => createAuthRuntime(config, database, options),
        },
        { provide: APP_GUARD, useClass: CsrfGuard },
      ],
    };
  }
}
