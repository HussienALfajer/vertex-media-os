import { Controller, Get, Inject, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { type DatabaseClient } from '@vertex-os/database';
import { DATABASE_CLIENT } from '../database/database.module.js';
import { PROBLEM_CONTENT_TYPE } from '../http/problem-details.js';
import { ProblemDetailsSchema } from '../openapi/problem-details.schema.js';
import { LivenessResponse, ReadinessResponse } from './health.responses.js';

/** Upper bound for the readiness probe so a stalled database cannot hang the check. */
const READINESS_TIMEOUT_MS = 3_000;

@ApiTags('health')
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  /** The process and its HTTP stack are running. Deliberately independent of PostgreSQL. */
  @Get('live')
  @ApiOkResponse({ description: 'The API process is live.', type: LivenessResponse })
  live(): LivenessResponse {
    return { status: 'ok' };
  }

  /** The API can serve traffic: every required dependency (PostgreSQL) answers. */
  @Get('ready')
  @ApiOkResponse({
    description: 'All required dependencies are reachable.',
    type: ReadinessResponse,
  })
  @ApiServiceUnavailableResponse({
    description: 'A required dependency is unreachable (`code`: `NOT_READY`).',
    content: { [PROBLEM_CONTENT_TYPE]: { schema: ProblemDetailsSchema } },
  })
  async ready(): Promise<ReadinessResponse> {
    try {
      await withTimeout(this.database.ping(), READINESS_TIMEOUT_MS);
    } catch (error) {
      this.logger.warn(`readiness check failed: PostgreSQL unreachable (${describe(error)})`);
      throw new ServiceUnavailableException('PostgreSQL is not reachable.', {
        cause: error,
        errorCode: 'NOT_READY',
      });
    }
    return { status: 'ready' };
  }
}

function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs} ms`)), timeoutMs);
  });
  return Promise.race([operation, timeout]).finally(() => clearTimeout(timer));
}

/** Error class and message only: no stack trace and never the configured connection string. */
function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error';
}
