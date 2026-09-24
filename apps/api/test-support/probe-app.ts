import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Module,
  Post,
  Req,
  Res,
  type DynamicModule,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { AuthorizationContext, PermissionCode } from '@vertex-os/iam';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { API_PREFIX } from '../src/app.factory.js';
import { AppModule, type AppModuleOptions } from '../src/app.module.js';
import {
  CURRENT_ACTOR,
  Public,
  RequirePermission,
  type CurrentActor,
} from '../src/auth/access.guard.js';
import type { AppConfig } from '../src/config/app-config.js';
import type { AuthConfig } from '../src/config/auth-config.js';
import { ProblemDetailsFilter } from '../src/http/problem-details.js';
import { testProvisioningConfig } from './provisioning-config.js';

export const PROBE_PERMISSION = 'iam.users.read' as PermissionCode;

/**
 * Routes a later module could add, next to the real application (IAM-R04). None is annotated
 * unless the case needs it: that is what protected-by-default has to catch. It lives in its own
 * module and reaches the current actor only through the injectable capability, as a later
 * module's controller would.
 */
@Controller('probe')
class ProbeController {
  constructor(@Inject(CURRENT_ACTOR) private readonly actors: CurrentActor) {}

  @Get('unmarked')
  unmarked(): { reached: true } {
    return { reached: true };
  }

  @Post('unmarked')
  @HttpCode(200)
  unmarkedWrite(): { reached: true } {
    return { reached: true };
  }

  /** Any ACTIVE user: the handler asks for the context itself (the current-user capability). */
  @Get('actor')
  actor(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthorizationContext> {
    return this.actors.require(request, reply);
  }

  @Get('guarded')
  @RequirePermission(PROBE_PERMISSION)
  guarded(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthorizationContext> {
    return this.actors.require(request, reply);
  }

  @Post('guarded')
  @HttpCode(200)
  @RequirePermission(PROBE_PERMISSION)
  guardedWrite(): { reached: true } {
    return { reached: true };
  }

  @Get('contradiction')
  @Public()
  @RequirePermission(PROBE_PERMISSION)
  contradiction(): { reached: true } {
    return { reached: true };
  }
}

@Module({})
class ProbeModule {
  static forRoot(config: AppConfig, auth: AuthConfig, options: AppModuleOptions): DynamicModule {
    return {
      module: ProbeModule,
      imports: [AppModule.forRoot(config, auth, testProvisioningConfig(), options)],
      controllers: [ProbeController],
    };
  }
}

export interface ProbeAppOptions extends AppModuleOptions {
  readonly logStream?: { write(line: string): void };
}

/**
 * The real application module plus the probe routes, with the API prefix and the Problem Details
 * filter of `createApp`. The access guard is global, so it covers the probe routes as it covers
 * every route of the application.
 */
export async function createProbeApp(
  config: AppConfig,
  auth: AuthConfig,
  options: ProbeAppOptions = {},
): Promise<NestFastifyApplication> {
  const { logStream, ...moduleOptions } = options;
  const app = await NestFactory.create<NestFastifyApplication>(
    ProbeModule.forRoot(config, auth, moduleOptions),
    new FastifyAdapter({
      logger: { level: 'info', ...(logStream ? { stream: logStream } : {}) },
    }),
    { logger: false, abortOnError: false },
  );
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalFilters(new ProblemDetailsFilter());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
