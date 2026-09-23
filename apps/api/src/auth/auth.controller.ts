import { Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConsumes,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { resolveIdentityUser, signIn } from '@vertex-os/iam';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { PROBLEM_CONTENT_TYPE } from '../http/problem-details.js';
import { ProblemDetailsSchema } from '../openapi/problem-details.schema.js';
import type { AuthRuntime } from './auth-runtime.js';
import { CsrfTokenResponse, LogoutResponse, SessionResponse } from './auth.responses.js';
import {
  clearedCookie,
  LOGIN_COOKIE,
  loginCookie,
  readCookie,
  SESSION_COOKIE,
  sessionCookie,
} from './cookies.js';
import { AUTH_RUNTIME, CsrfExempt } from './csrf.guard.js';
import {
  requireSession,
  systemAttribution,
  traceIdOf,
  userAttribution,
} from './request-session.js';

/** Browser-visible outcome codes of a failed sign-in (IAM-R03 D-23). */
type SignInFailure = 'AUTH_ACCESS_DENIED' | 'AUTH_LOGIN_FAILED' | 'IDENTITY_PROVIDER_UNAVAILABLE';

const NO_STORE = 'no-store';
const problem = { content: { [PROBLEM_CONTENT_TYPE]: { schema: ProblemDetailsSchema } } };

/**
 * The BFF authentication endpoints of spec Section 25.1. Login, callback and back-channel logout
 * are public by design (spec Section 24); session, CSRF and logout need a valid session.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(@Inject(AUTH_RUNTIME) private readonly runtime: AuthRuntime) {}

  /** Starts an OIDC sign-in: stores a login attempt and redirects to Keycloak. */
  @Get('login')
  @ApiResponse({ status: 302, description: 'Redirect to the identity provider.' })
  @ApiResponse({ status: 303, description: 'Sign-in cannot start: back to the app (`authError`).' })
  async login(@Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    const authorization = await this.runtime.oidc.authorizationRequest();
    if (!authorization.ok) {
      request.log.warn(
        { auth: 'login-start-failed', failure: authorization.failure, code: authorization.code },
        'sign-in could not start',
      );
      return this.signInFailed(
        reply,
        authorization.failure === 'unavailable'
          ? 'IDENTITY_PROVIDER_UNAVAILABLE'
          : 'AUTH_LOGIN_FAILED',
      );
    }
    const { url, ...secrets } = authorization.value;
    const handle = await this.runtime.sessions.startLogin(secrets);
    void reply
      .code(302)
      .header('cache-control', NO_STORE)
      .header(
        'set-cookie',
        loginCookie(handle, this.runtime.config.session.loginAttemptTimeoutSeconds),
      )
      .header('location', url)
      .send();
  }

  /** Completes the sign-in (spec Section 13 steps 6–13) and issues the session cookie. */
  @Get('callback')
  @ApiResponse({
    status: 303,
    description:
      'Back to the app: `/` when signed in, otherwise `/?authError=` with `AUTH_ACCESS_DENIED`, ' +
      '`AUTH_LOGIN_FAILED` or `IDENTITY_PROVIDER_UNAVAILABLE`.',
  })
  async callback(@Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    // The login attempt is single-use whatever happens next: every answer below clears its cookie.
    const attempt = await this.runtime.sessions.finishLogin(
      readCookie(request.headers.cookie, LOGIN_COOKIE),
    );
    if (attempt.outcome !== 'found') {
      request.log.warn(
        { auth: 'sign-in-failed', reason: `attempt-${attempt.outcome}` },
        'sign-in failed',
      );
      return this.signInFailed(reply, 'AUTH_LOGIN_FAILED');
    }

    const query = request.url.includes('?') ? request.url.slice(request.url.indexOf('?') + 1) : '';
    const identity = await this.runtime.oidc.completeAuthorization({
      query,
      state: attempt.state,
      nonce: attempt.nonce,
      codeVerifier: attempt.codeVerifier,
    });
    if (!identity.ok) {
      request.log.warn(
        { auth: 'sign-in-failed', reason: identity.failure, code: identity.code },
        'sign-in failed',
      );
      return this.signInFailed(
        reply,
        identity.failure === 'unavailable' ? 'IDENTITY_PROVIDER_UNAVAILABLE' : 'AUTH_LOGIN_FAILED',
      );
    }

    const result = await signIn(this.runtime.iam, {
      issuer: identity.value.issuer,
      subject: identity.value.subject,
      traceId: traceIdOf(request),
    });
    if (result.outcome !== 'signed-in') {
      request.log.warn({ auth: 'sign-in-denied', reason: result.outcome }, 'sign-in denied');
      return this.signInFailed(
        reply,
        result.outcome === 'conflict' ? 'AUTH_LOGIN_FAILED' : 'AUTH_ACCESS_DENIED',
      );
    }

    const attribution = userAttribution(request, result.userId);
    const previous = await this.runtime.sessions.authenticate(
      readCookie(request.headers.cookie, SESSION_COOKIE),
    );
    const { secret } = await this.runtime.sessions.establish({
      userId: result.userId,
      idpSessionId: identity.value.idpSessionId,
      idToken: identity.value.idToken,
      attribution,
    });
    // A new sign-in in the same browser always replaces the session it held (session rotation).
    if (previous.outcome === 'valid') {
      await this.runtime.sessions.revoke(previous.session, 'REPLACED', attribution);
    }
    request.log.info(
      { auth: 'sign-in', firstActivation: result.firstActivation },
      'application session established',
    );
    void reply
      .code(303)
      .header('cache-control', NO_STORE)
      .header('set-cookie', [clearedCookie(LOGIN_COOKIE), sessionCookie(secret)])
      .header('location', '/')
      .send();
  }

  /** The current session and its user; never a token or a session identifier. */
  @Get('session')
  @ApiOkResponse({ type: SessionResponse })
  @ApiUnauthorizedResponse({
    description: '`AUTHENTICATION_REQUIRED`, `AUTH_SESSION_INVALID` or `AUTH_SESSION_EXPIRED`.',
    ...problem,
  })
  @ApiForbiddenResponse({ description: '`IAM_USER_INACTIVE`.', ...problem })
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

  /** The session's CSRF token, for the browser to hold in memory only (spec Section 15). */
  @Get('csrf')
  @ApiOkResponse({ type: CsrfTokenResponse })
  @ApiUnauthorizedResponse({ description: 'No valid session.', ...problem })
  @ApiForbiddenResponse({ description: '`IAM_USER_INACTIVE`.', ...problem })
  async csrf(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<CsrfTokenResponse> {
    const { secret } = await requireSession(this.runtime, request, reply);
    void reply.header('cache-control', NO_STORE);
    return { token: this.runtime.sessions.csrfToken(secret) };
  }

  /**
   * Ends the session (the CSRF guard has checked the session and its token) and returns the
   * identity provider's end-session URL, so the Keycloak session ends too (spec Section 32).
   */
  @Post('logout')
  @HttpCode(200)
  @ApiOkResponse({ type: LogoutResponse })
  @ApiUnauthorizedResponse({ description: 'No valid session.', ...problem })
  @ApiForbiddenResponse({
    description: '`CSRF_VALIDATION_FAILED` or `IAM_USER_INACTIVE`.',
    ...problem,
  })
  async logout(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<LogoutResponse> {
    const { session, user } = await requireSession(this.runtime, request, reply);
    const idToken = this.runtime.sessions.idTokenOf(session);
    await this.runtime.sessions.revoke(session, 'LOGOUT', userAttribution(request, user.id));
    // Built after the revocation committed; it may need the provider's metadata (invariant 10).
    const logoutUrl =
      (await this.runtime.oidc.endSessionUrl(idToken)) ??
      this.runtime.config.oidc.postLogoutRedirectUri;
    void reply
      .header('cache-control', NO_STORE)
      .header('set-cookie', clearedCookie(SESSION_COOKIE));
    request.log.info({ auth: 'logout' }, 'application session ended');
    return { logoutUrl };
  }

  /** Keycloak back-channel logout (spec Section 33), validated by the logout token alone. */
  @Post('backchannel-logout')
  @CsrfExempt()
  @ApiConsumes('application/x-www-form-urlencoded')
  @ApiOkResponse({ description: 'The matching sessions are revoked (idempotent).' })
  @ApiBadRequestResponse({ description: 'The logout token is missing or invalid.' })
  async backchannelLogout(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    void reply.header('cache-control', NO_STORE);
    const token = logoutTokenOf(request.body);
    const verified =
      token === undefined
        ? ({ ok: false, failure: 'rejected' } as const)
        : await this.runtime.oidc.verifyLogoutToken(token);
    if (!verified.ok) {
      request.log.warn(
        { auth: 'backchannel-logout-rejected', failure: verified.failure, code: verified.code },
        'back-channel logout rejected',
      );
      void reply.code(400).send({ error: 'invalid_request' });
      return;
    }

    const attribution = systemAttribution(request, 'iam.backchannel-logout');
    let revoked: number;
    if (verified.value.sessionId !== undefined) {
      revoked = await this.runtime.sessions.revokeIdpSession(
        verified.value.sessionId,
        'BACKCHANNEL_LOGOUT',
        attribution,
      );
    } else {
      const userId = await resolveIdentityUser(this.runtime.iam, {
        issuer: this.runtime.config.oidc.issuer,
        subject: verified.value.subject,
      });
      revoked =
        userId === undefined
          ? 0
          : await this.runtime.sessions.revokeUserSessions(
              userId,
              'BACKCHANNEL_LOGOUT',
              attribution,
            );
    }
    request.log.info({ auth: 'backchannel-logout', revoked }, 'back-channel logout processed');
    void reply.code(200).send();
  }

  private signInFailed(reply: FastifyReply, code: SignInFailure): void {
    // Fastify appends every `set-cookie` value, so each answer sets its cookies exactly once.
    void reply
      .code(303)
      .header('cache-control', NO_STORE)
      .header('set-cookie', clearedCookie(LOGIN_COOKIE))
      .header('location', `/?authError=${code}`)
      .send();
  }
}

function logoutTokenOf(body: unknown): string | undefined {
  const token =
    typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)['logout_token']
      : undefined;
  return typeof token === 'string' && token.length > 0 && token.length <= 16_384
    ? token
    : undefined;
}
