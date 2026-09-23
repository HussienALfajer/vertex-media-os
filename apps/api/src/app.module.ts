import { type DynamicModule, Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import type { AuthRuntimeOptions } from './auth/auth-runtime.js';
import { type AppConfig } from './config/app-config.js';
import type { AuthConfig } from './config/auth-config.js';
import { ConfigModule } from './config/config.module.js';
import { HealthModule } from './health/health.module.js';

/** Root composition module. Business domain modules are added here once they exist. */
@Module({})
export class AppModule {
  static forRoot(
    config: AppConfig,
    auth: AuthConfig,
    authOptions: AuthRuntimeOptions = {},
  ): DynamicModule {
    return {
      module: AppModule,
      imports: [ConfigModule.forRoot(config), HealthModule, AuthModule.forRoot(auth, authOptions)],
    };
  }
}
