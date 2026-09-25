import {
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { RequestValidationException } from '../http/problem-details.js';
import type { AuthRuntime } from './auth-runtime.js';
import { CsrfTokenResponse, LogoutResponse, SessionResponse } from './auth.responses.js';
import { AUTH_RUNTIME, Public } from './access.guard.js';
import {
  clearedCookie,
  LOGIN_COOKIE,
  readCookie,
  SESSION_COOKIE,
  sessionCookie,
} from './cookies.js';
import { clientAddressKey } from './rate-limit.js';
import {
  requireSession,
  systemAttribution,
  traceIdOf,
  userAttribution,
} from './request-session.js';

const NO_STORE = 'no-store';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(@Inject(AUTH_RUNTIME) private readonly runtime: AuthRuntime) {}

  /** Same-origin JSON credentials create an opaque application session. */
  @Post('login')
  @Public()
  @HttpCode(200)
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'password'],
      additionalProperties: false,
      properties: {
        email: { type: 'string', format: 'email', maxLength: 254 },
        password: { type: 'string', format: 'password', minLength: 15, maxLength: 128 },
      },
    },
  })
  @ApiOkResponse({ type: SessionResponse })
  async login(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<SessionResponse> {
    void reply.header('cache-control', NO_STORE);
    const body = request.body;
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new RequestValidationException(['email', 'password']);
    }
    const input = body as Record<string, unknown>;
    if (
      Object.keys(input).some((key) => key !== 'email' && key !== 'password') ||
      typeof input['email'] !== 'string' ||
      input['email'].length > 254 ||
      typeof input['password'] !== 'string' ||
      Buffer.byteLength(input['password'], 'utf8') > 512
    ) {
      throw new RequestValidationException(['email', 'password']);
    }
    const address = clientAddressKey(request.ip);
    const limiter = this.runtime.limits.signIn;
    const byAddress = limiter.take(`login-address:${address}`);
    const byEmail = limiter.take(`login-email:${input['email'].trim().toLowerCase()}`);
    if (!byAddress.allowed || !byEmail.allowed) {
      if ((!byAddress.allowed && byAddress.first) || (!byEmail.allowed && byEmail.first)) {
        request.log.warn(
          { auth: 'login-rate-limited' },
          'sign-in attempts exceeded the configured limit',
        );
      }
      const waitAddress = byAddress.allowed ? 0 : byAddress.retryAfterSeconds;
      const waitEmail = byEmail.allowed ? 0 : byEmail.retryAfterSeconds;
      void reply.header('retry-after', String(Math.max(waitAddress, waitEmail)));
      throw new HttpException(
        'Too many sign-in attempts; retry later.',
        HttpStatus.TOO_MANY_REQUESTS,
        {
          errorCode: 'RATE_LIMITED',
        },
      );
    }

    const result = await this.runtime.iam.localSignIn(
      input['email'],
      input['password'],
      traceIdOf(request),
    );
    if (result.outcome !== 'signed-in') {
      request.log.warn({ auth: 'sign-in-denied' }, 'sign-in denied');
      throw new UnauthorizedException('The email or password is incorrect.', {
        errorCode: 'AUTH_LOGIN_FAILED',
      });
    }
    const user = await this.runtime.iam.resolveSessionUser(result.userId);
    if (user.outcome !== 'active') {
      throw new UnauthorizedException('The email or password is incorrect.', {
        errorCode: 'AUTH_LOGIN_FAILED',
      });
    }
    const previous = await this.runtime.sessions.authenticate(
      readCookie(request.headers.cookie, SESSION_COOKIE),
      systemAttribution(request, 'iam.session-check'),
    );
    const { secret, session } = await this.runtime.sessions.establish({
      userId: result.userId,
      idpSessionId: undefined,
      idToken: undefined,
      refreshToken: undefined,
      attribution: userAttribution(request, result.userId),
    });
    if (previous.outcome === 'valid') {
      await this.runtime.sessions.revoke(
        previous.session,
        'REPLACED',
        userAttribution(request, result.userId),
      );
    }
    void reply.header('set-cookie', [clearedCookie(LOGIN_COOKIE), sessionCookie(secret)]);
    request.log.info(
      { auth: 'sign-in', firstActivation: result.firstActivation },
      'application session established',
    );
    return {
      user: { id: user.user.id, email: user.user.email, displayName: user.user.displayName },
      session: {
        idleExpiresAt: session.idleExpiresAt.toISOString(),
        absoluteExpiresAt: session.absoluteExpiresAt.toISOString(),
      },
    };
  }

  @Get('session')
  @ApiCookieAuth('session')
  @ApiOkResponse({ type: SessionResponse })
  async session(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<SessionResponse> {
    const { session, user } = await requireSession(this.runtime, request, reply);
    void reply.header('cache-control', NO_STORE);
    return {
      user: { id: user.id, email: user.email, displayName: user.displayName },
      session: {
        idleExpiresAt: session.idleExpiresAt.toISOString(),
        absoluteExpiresAt: session.absoluteExpiresAt.toISOString(),
      },
    };
  }

  @Get('csrf')
  @ApiCookieAuth('session')
  @ApiOkResponse({ type: CsrfTokenResponse })
  async csrf(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<CsrfTokenResponse> {
    const { secret } = await requireSession(this.runtime, request, reply);
    void reply.header('cache-control', NO_STORE);
    return { token: this.runtime.sessions.csrfToken(secret) };
  }

  @Post('logout')
  @HttpCode(200)
  @ApiCookieAuth('session')
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiOkResponse({ type: LogoutResponse })
  async logout(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<LogoutResponse> {
    const limited = this.runtime.limits.logout.take(`logout:${clientAddressKey(request.ip)}`);
    if (!limited.allowed) {
      void reply.header('retry-after', String(limited.retryAfterSeconds));
      throw new HttpException(
        'Too many logout requests; retry later.',
        HttpStatus.TOO_MANY_REQUESTS,
        {
          errorCode: 'RATE_LIMITED',
        },
      );
    }
    const { session, user } = await requireSession(this.runtime, request, reply);
    await this.runtime.sessions.revoke(session, 'LOGOUT', userAttribution(request, user.id));
    void reply
      .header('cache-control', NO_STORE)
      .header('set-cookie', clearedCookie(SESSION_COOKIE));
    request.log.info({ auth: 'logout' }, 'application session ended');
    return { logoutUrl: '/' };
  }
}
