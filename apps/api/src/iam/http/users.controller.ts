import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { userAccessStates } from '@vertex-os/iam';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { CURRENT_ACTOR, type CurrentActor } from '../../auth/access.guard.js';
import {
  IAM_DIRECTORY,
  IAM_USER_ADMINISTRATION,
  type IamDirectory,
  type IamUserAdministration,
} from './capabilities.js';
import { IAM_PERMISSIONS, IamRoute, PageQueries, permission } from './docs.js';
import { isOutcome, refuse } from './iam-problems.js';
import { actorAttribution, NoStoreInterceptor, parseInput, pathId } from './request.js';
import { toPage, toUser, toUserDetail, toUserSummary } from './responses.js';
import {
  CreateUserBody,
  InitializePasswordBody,
  ReactivateUserBody,
  ReasonBody,
  refs,
  UpdateUserBody,
  UserListQuery,
} from './schemas.js';

type Restriction = 'suspendUser' | 'disableUser' | 'terminateUser';

const NOT_FOUND = { 404: '`IAM_USER_NOT_FOUND`' } as const;

/**
 * Users (spec Section 25.3): the directory, creation, the display name and the access lifecycle.
 * Each handler validates its input, attributes the change to the session's user, calls one bound
 * capability and maps its outcome (IAM-R07 D-04 to D-07); the rules are IAM's.
 */
@ApiTags('iam')
@Controller('iam/users')
@UseInterceptors(NoStoreInterceptor)
export class UsersController {
  constructor(
    @Inject(CURRENT_ACTOR) private readonly actors: CurrentActor,
    @Inject(IAM_DIRECTORY) private readonly directory: IamDirectory,
    @Inject(IAM_USER_ADMINISTRATION) private readonly users: IamUserAdministration,
  ) {}

  @Get()
  @PageQueries({
    accessState: { enum: userAccessStates },
    departmentId: { uuid: true },
    roleId: { uuid: true },
  })
  @IamRoute({
    permission: permission(IAM_PERMISSIONS.usersRead),
    unsafe: false,
    success: { status: 200, description: 'One page of the user directory.', schema: refs.UserPage },
  })
  async list(@Query() query: unknown) {
    const result = await this.directory.listUsers(parseInput(UserListQuery, query));
    if (result.outcome !== 'listed') refuse(result);
    return toPage(result.page, toUserSummary);
  }

  @Post()
  @IamRoute({
    permission: permission(IAM_PERMISSIONS.usersCreate),
    unsafe: true,
    body: refs.CreateUserBody,
    success: {
      status: 201,
      description: 'Creates a local password account. It becomes active on first sign-in.',
      schema: refs.CreateUser,
    },
    errors: {
      403: '`IAM_GRANT_EXCEEDS_ACTOR`',
      404: '`IAM_ROLE_NOT_FOUND`, `IAM_DEPARTMENT_NOT_FOUND`',
      409: '`IAM_EMAIL_CONFLICT`, `IAM_ROLE_INACTIVE`, `IAM_DEPARTMENT_INACTIVE`',
    },
  })
  async create(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const input = parseInput(CreateUserBody, body);
    const attribution = await actorAttribution(this.actors, request, reply);
    const result = await this.users.createUser(input, attribution);
    if (result.outcome !== 'created') refuse(result);
    return { user: toUser(result.user) };
  }

  @Get(':userId')
  @IamRoute({
    permission: permission(IAM_PERMISSIONS.usersRead),
    unsafe: false,
    params: ['userId'],
    success: {
      status: 200,
      description: 'The user with memberships and roles.',
      schema: refs.UserDetail,
    },
    errors: NOT_FOUND,
  })
  async detail(@Param('userId') userId: string) {
    const result = await this.directory.getUser({ userId: pathId('userId', userId) });
    if (result.outcome !== 'found') refuse(result);
    return toUserDetail(result.user);
  }

  @Patch(':userId')
  @IamRoute({
    permission: permission(IAM_PERMISSIONS.usersUpdate),
    unsafe: true,
    params: ['userId'],
    body: refs.UpdateUserBody,
    success: { status: 200, description: 'The updated user.', schema: refs.User },
    errors: { ...NOT_FOUND, 409: '`IAM_VERSION_CONFLICT`' },
  })
  async update(
    @Param('userId') userId: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const input = parseInput(UpdateUserBody, body);
    const id = pathId('userId', userId);
    const attribution = await actorAttribution(this.actors, request, reply);
    const result = await this.users.updateDisplayName({ userId: id, ...input }, attribution);
    if (!isOutcome(result, 'updated', 'unchanged')) refuse(result);
    return toUser(result.user);
  }

  @Post(':userId/password')
  @HttpCode(200)
  @IamRoute({
    permission: permission(IAM_PERMISSIONS.usersManageAccess),
    unsafe: true,
    params: ['userId'],
    body: refs.InitializePasswordBody,
    success: {
      status: 200,
      description: 'Initializes a migrated account password and revokes its old sessions.',
      schema: refs.RestrictUser,
    },
    errors: {
      ...NOT_FOUND,
      403: '`IAM_GRANT_EXCEEDS_ACTOR`',
      409: '`IAM_VERSION_CONFLICT`, `IAM_PASSWORD_ALREADY_CONFIGURED`',
    },
  })
  async initializePassword(
    @Param('userId') userId: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const input = parseInput(InitializePasswordBody, body);
    const attribution = await actorAttribution(this.actors, request, reply);
    const result = await this.users.initializePassword(
      { userId: pathId('userId', userId), ...input },
      attribution,
    );
    if (result.outcome !== 'initialized') refuse(result);
    return { user: toUser(result.user), sessionsRevoked: result.sessionsRevoked };
  }

  @Post(':userId/suspend')
  @HttpCode(200)
  @IamRoute(restrictionDocs('Suspended'))
  suspend(
    @Param('userId') userId: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.restrict('suspendUser', userId, body, request, reply);
  }

  @Post(':userId/disable')
  @HttpCode(200)
  @IamRoute(restrictionDocs('Disabled'))
  disable(
    @Param('userId') userId: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.restrict('disableUser', userId, body, request, reply);
  }

  @Post(':userId/terminate')
  @HttpCode(200)
  @IamRoute(restrictionDocs('Terminated'))
  terminate(
    @Param('userId') userId: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.restrict('terminateUser', userId, body, request, reply);
  }

  private async restrict(
    operation: Restriction,
    userId: string,
    body: unknown,
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const input = parseInput(ReasonBody, body);
    const id = pathId('userId', userId);
    const attribution = await actorAttribution(this.actors, request, reply, input?.reason);
    const result = await this.users[operation]({ userId: id }, attribution);
    if (result.outcome !== 'restricted') refuse(result);
    return { user: toUser(result.user), sessionsRevoked: result.sessionsRevoked };
  }

  @Post(':userId/reactivate')
  @HttpCode(200)
  @IamRoute({
    permission: permission(IAM_PERMISSIONS.usersManageAccess),
    unsafe: true,
    params: ['userId'],
    body: refs.ReactivateUserBody,
    success: {
      status: 200,
      description: 'Restored to the state the backend derives: ACTIVE, or INVITED.',
      schema: refs.ReactivateUser,
    },
    errors: {
      ...NOT_FOUND,
      403: '`IAM_GRANT_EXCEEDS_ACTOR`',
      409: '`IAM_VERSION_CONFLICT`, `IAM_INVALID_ACCESS_TRANSITION`, `IAM_OPERATION_SUPERSEDED`, `IAM_IDENTITY_CONFLICT`',
    },
  })
  async reactivate(
    @Param('userId') userId: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const input = parseInput(ReactivateUserBody, body);
    const id = pathId('userId', userId);
    const attribution = await actorAttribution(this.actors, request, reply, input.reason);
    const result = await this.users.reactivateUser(
      { userId: id, expectedVersion: input.expectedVersion },
      attribution,
    );
    if (result.outcome !== 'reactivated') refuse(result);
    return { user: toUser(result.user), target: result.target };
  }

  @Post(':userId/revoke-sessions')
  @HttpCode(200)
  @IamRoute({
    permission: permission(IAM_PERMISSIONS.sessionsRevoke),
    unsafe: true,
    params: ['userId'],
    body: refs.ReasonBody,
    bodyRequired: false,
    success: {
      status: 200,
      description: 'Every application session of the user is revoked.',
      schema: refs.RevokeSessions,
    },
    errors: NOT_FOUND,
  })
  async revokeSessions(
    @Param('userId') userId: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const input = parseInput(ReasonBody, body);
    const id = pathId('userId', userId);
    const attribution = await actorAttribution(this.actors, request, reply, input?.reason);
    const result = await this.users.revokeSessions({ userId: id }, attribution);
    if (result.outcome !== 'revoked') refuse(result);
    return {
      sessionsRevoked: result.sessionsRevoked,
    };
  }
}

function restrictionDocs(state: 'Suspended' | 'Disabled' | 'Terminated') {
  return {
    permission: permission(IAM_PERMISSIONS.usersManageAccess),
    unsafe: true,
    params: ['userId'],
    body: refs.ReasonBody,
    bodyRequired: false,
    success: {
      status: 200,
      description: `${state}; application sessions revoked.`,
      schema: refs.RestrictUser,
    },
    errors: { ...NOT_FOUND, 409: '`IAM_INVALID_ACCESS_TRANSITION`, `IAM_LAST_SYSTEM_ADMIN`' },
  } as const;
}
