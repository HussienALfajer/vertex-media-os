import { Controller, Get, Inject, Req, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { type DatabaseClient, DatabaseUnavailableError } from '@vertex-os/database';
import type { FastifyRequest } from 'fastify';
import { Public } from '../auth/access.guard.js';
import { DATABASE_CLIENT } from '../database/database.module.js';
import { PROBLEM_CONTENT_TYPE } from '../http/problem-details.js';
import { ProblemDetailsSchema } from '../openapi/problem-details.schema.js';
import { LivenessResponse, ReadinessResponse } from './health.responses.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  /** The process and its HTTP stack are running. Deliberately independent of PostgreSQL. */
  @Get('live')
  @Public()
  @ApiOkResponse({ description: 'The API process is live.', type: LivenessResponse })
  live(): LivenessResponse {
    return { status: 'ok' };
  }

  /** The API can serve traffic: every required dependency (PostgreSQL) answers. */
  @Get('ready')
  @Public()
  @ApiOkResponse({
    description: 'All required dependencies are reachable.',
    type: ReadinessResponse,
  })
  @ApiServiceUnavailableResponse({
    description: 'A required dependency is unreachable (`code`: `NOT_READY`).',
    content: { [PROBLEM_CONTENT_TYPE]: { schema: ProblemDetailsSchema } },
  })
  async ready(@Req() request: FastifyRequest): Promise<ReadinessResponse> {
    const startedAt = performance.now();
    try {
      // Bounded by the database client itself (connect and statement timeouts), so a failed check
      // leaves no connection attempt or query running once it has answered.
      await this.database.ping();
    } catch (error) {
      // The request logger adds `reqId`. Only log-safe facts are recorded, never a driver message.
      request.log.warn(
        {
          dependency: 'postgresql',
          ...(error instanceof DatabaseUnavailableError
            ? {
                reason: error.reason,
                ...(error.sqlState === undefined ? {} : { sqlState: error.sqlState }),
              }
            : { reason: 'Unexpected' }),
          durationMs: Math.round(performance.now() - startedAt),
        },
        'readiness check failed',
      );
      throw new ServiceUnavailableException('PostgreSQL is not reachable.', {
        errorCode: 'NOT_READY',
      });
    }
    return { status: 'ready' };
  }
}
