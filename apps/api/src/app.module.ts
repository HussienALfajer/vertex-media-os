import { type DynamicModule, Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import type { AuthRuntimeOptions } from './auth/auth-runtime.js';
import { type AppConfig } from './config/app-config.js';
import type { AuthConfig } from './config/auth-config.js';
import { ConfigModule } from './config/config.module.js';
import type { IdentityProvisioningConfig } from './config/identity-provisioning-config.js';
import { HealthModule } from './health/health.module.js';
import { IamModule, type IamModuleOptions } from './iam/iam.module.js';

export interface AppModuleOptions extends AuthRuntimeOptions, IamModuleOptions {}

/** Root composition module. Business domain modules are added here as they are exposed. */
@Module({})
export class AppModule {
  static forRoot(
    config: AppConfig,
    auth: AuthConfig,
    provisioning: IdentityProvisioningConfig,
    options: AppModuleOptions = {},
  ): DynamicModule {
    const { identityFetch, ...authOptions } = options;
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(config),
        HealthModule,
        AuthModule.forRoot(auth, authOptions),
        IamModule.forRoot(provisioning, identityFetch === undefined ? {} : { identityFetch }),
      ],
    };
  }
}
