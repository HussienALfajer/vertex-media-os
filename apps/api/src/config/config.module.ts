import { type DynamicModule, Module } from '@nestjs/common';
import { type AppConfig } from './app-config.js';

/** Injection token for the validated {@link AppConfig}. */
export const APP_CONFIG = Symbol('APP_CONFIG');

@Module({})
export class ConfigModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: ConfigModule,
      global: true,
      providers: [{ provide: APP_CONFIG, useValue: config }],
      exports: [APP_CONFIG],
    };
  }
}
