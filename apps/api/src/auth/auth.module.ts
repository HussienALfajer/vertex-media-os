import { type DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import type { DatabaseClient } from '@vertex-os/database';
import type { AuthConfig } from '../config/auth-config.js';
import { DATABASE_CLIENT, DatabaseModule } from '../database/database.module.js';
import { AuthController } from './auth.controller.js';
import { createAuthRuntime, type AuthRuntimeOptions } from './auth-runtime.js';
import { AccessGuard, AUTH_RUNTIME, createCurrentActor, CURRENT_ACTOR } from './access.guard.js';
import type { AuthRuntime } from './auth-runtime.js';
import { createUserSessionRevocation, USER_SESSION_REVOCATION } from './session-revocation.js';

/**
 * Browser authentication (IAM-R03): the BFF endpoints and the global access guard (IAM-R04),
 * composed over the process's database client. Platform infrastructure, not an IAM domain module (spec Section 6.2).
 */
@Module({})
export class AuthModule {
  static forRoot(config: AuthConfig, options: AuthRuntimeOptions = {}): DynamicModule {
    return {
      module: AuthModule,
      // Global for its exports: any module's handlers can inject the current actor (IAM-R04 D-10);
      // IAM user administration injects the session revocation (IAM-R07 D-09).
      global: true,
      imports: [DatabaseModule],
      controllers: [AuthController],
      providers: [
        {
          provide: AUTH_RUNTIME,
          inject: [DATABASE_CLIENT],
          useFactory: (database: DatabaseClient) => createAuthRuntime(config, database, options),
        },
        {
          provide: CURRENT_ACTOR,
          inject: [AUTH_RUNTIME],
          useFactory: (runtime: AuthRuntime) => createCurrentActor(runtime),
        },
        {
          provide: USER_SESSION_REVOCATION,
          inject: [AUTH_RUNTIME],
          useFactory: (runtime: AuthRuntime) => createUserSessionRevocation(runtime),
        },
        { provide: APP_GUARD, useClass: AccessGuard },
      ],
      exports: [CURRENT_ACTOR, USER_SESSION_REVOCATION],
    };
  }
}
