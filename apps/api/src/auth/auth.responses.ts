import { ApiProperty } from '@nestjs/swagger';

/** The signed-in user as `GET /api/auth/session` exposes it. */
export class SessionUserResponse {
  @ApiProperty({ type: String, format: 'uuid' })
  readonly id!: string;

  @ApiProperty({ type: String, format: 'email' })
  readonly email!: string;

  @ApiProperty({ type: String })
  readonly displayName!: string;
}

/** The session's deadlines; never its identifier or any token. */
export class SessionTimesResponse {
  @ApiProperty({ type: String, format: 'date-time' })
  readonly idleExpiresAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  readonly absoluteExpiresAt!: string;
}

/** Response contract of `GET /api/auth/session` (spec Section 25.1). */
export class SessionResponse {
  @ApiProperty({ type: SessionUserResponse })
  readonly user!: SessionUserResponse;

  @ApiProperty({ type: SessionTimesResponse })
  readonly session!: SessionTimesResponse;
}

/** Response contract of `GET /api/auth/csrf`: send `token` as `X-CSRF-Token` on unsafe requests. */
export class CsrfTokenResponse {
  @ApiProperty({ type: String })
  readonly token!: string;
}

/** Response contract of `POST /api/auth/logout`: where the browser goes next. */
export class LogoutResponse {
  @ApiProperty({
    type: String,
    description: 'The application route to show after the local session ends.',
  })
  readonly logoutUrl!: string;
}
