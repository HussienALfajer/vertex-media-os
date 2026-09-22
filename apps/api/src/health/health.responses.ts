import { ApiProperty } from '@nestjs/swagger';

/** Response contract of `GET /api/health/live`. */
export class LivenessResponse {
  @ApiProperty({ type: String, enum: ['ok'], example: 'ok' })
  readonly status!: 'ok';
}

/** Response contract of `GET /api/health/ready` when every required dependency answers. */
export class ReadinessResponse {
  @ApiProperty({ type: String, enum: ['ready'], example: 'ready' })
  readonly status!: 'ready';
}
