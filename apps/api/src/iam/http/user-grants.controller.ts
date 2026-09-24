import {
  Body,
  Controller,
  Delete,
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
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { CURRENT_ACTOR, type CurrentActor } from '../../auth/access.guard.js';
import { IAM_ADMINISTRATION, type IamAdministration } from './capabilities.js';
import { IAM_PERMISSIONS, IamRoute, permission } from './docs.js';
import { isOutcome, refuse } from './iam-problems.js';
import { actorAttribution, NoStoreInterceptor, parseInput, pathId } from './request.js';
import {
  AddMembershipBody,
  AssignRoleBody,
  EmptyBody,
  refs,
  RemoveMembershipQuery,
  SetMembershipBody,
} from './schemas.js';

const USER_NOT_FOUND = '`IAM_USER_NOT_FOUND`';

/**
 * A user's department memberships and role assignments (spec Sections 25.4, 25.5). Membership and
 * role rules, the last-System-Administrator rule and the grant ceiling are IAM's; the route checks
 * the coarse permission and attributes the change to the session's user (IAM-R07 D-07).
 */
@ApiTags('iam')
@Controller('iam/users/:userId')
@UseInterceptors(NoStoreInterceptor)
export class UserGrantsController {
  constructor(
    @Inject(CURRENT_ACTOR) private readonly actors: CurrentActor,
    @Inject(IAM_ADMINISTRATION) private readonly administration: IamAdministration,
  ) {}

  @Post('departments')
  @IamRoute({
    permission: permission(IAM_PERMISSIONS.usersManageDepartments),
    unsafe: true,
    params: ['userId'],
    body: refs.AddMembershipBody,
    success: {
      status: 201,
      description: 'The membership; a new primary demotes the previous one.',
      schema: refs.MembershipAdded,
    },
    errors: {
      404: `${USER_NOT_FOUND}, \`IAM_DEPARTMENT_NOT_FOUND\``,
      409: '`IAM_DEPARTMENT_INACTIVE`, `IAM_DUPLICATE_DEPARTMENT_MEMBERSHIP`',
    },
  })
  async addMembership(
    @Param('userId') userId: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const input = parseInput(AddMembershipBody, body);
    const id = pathId('userId', userId);
    const attribution = await actorAttribution(this.actors, request, reply);
    const result = await this.administration.addMembership({ userId: id, ...input }, attribution);
    if (result.outcome !== 'added') refuse(result);
    return {
      departmentId: input.departmentId,
      isPrimary: input.isPrimary,
      demotedPrimaryDepartmentId: result.demotedPrimaryDepartmentId ?? null,
    };
  }

  @Patch('departments/:departmentId')
  @IamRoute({
    permission: permission(IAM_PERMISSIONS.usersManageDepartments),
    unsafe: true,
    params: ['userId', 'departmentId'],
    body: refs.SetMembershipBody,
    success: {
      status: 200,
      description: 'The user’s primary department after the change.',
      schema: refs.PrimaryDepartment,
    },
    errors: {
      404: `${USER_NOT_FOUND}, \`IAM_MEMBERSHIP_NOT_FOUND\``,
      409: '`IAM_DEPARTMENT_INACTIVE`',
    },
  })
  async setMembership(
    @Param('userId') userId: string,
    @Param('departmentId') departmentId: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const input = parseInput(SetMembershipBody, body);
    const ids = {
      userId: pathId('userId', userId),
      departmentId: pathId('departmentId', departmentId),
    };
    const attribution = await actorAttribution(this.actors, request, reply);
    const result = await this.administration.setPrimaryMembership(
      { ...ids, ...input },
      attribution,
    );
    if (!isOutcome(result, 'updated', 'unchanged')) refuse(result);
    return { primaryDepartmentId: result.primaryDepartmentId ?? null };
  }

  @Delete('departments/:departmentId')
  @ApiQuery({
    name: 'replacementPrimaryDepartmentId',
    required: false,
    description: 'The new primary when the removed membership is the primary; never guessed.',
    schema: { type: 'string', format: 'uuid' },
  })
  @IamRoute({
    permission: permission(IAM_PERMISSIONS.usersManageDepartments),
    unsafe: true,
    params: ['userId', 'departmentId'],
    success: {
      status: 200,
      description: 'The user’s primary department after the removal.',
      schema: refs.PrimaryDepartment,
    },
    errors: {
      404: `${USER_NOT_FOUND}, \`IAM_MEMBERSHIP_NOT_FOUND\``,
      409: '`IAM_DEPARTMENT_INACTIVE`',
      422: '`IAM_PRIMARY_DEPARTMENT_CONFLICT`',
    },
  })
  async removeMembership(
    @Param('userId') userId: string,
    @Param('departmentId') departmentId: string,
    @Query() query: unknown,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const input = parseInput(RemoveMembershipQuery, query);
    parseInput(EmptyBody, body);
    const ids = {
      userId: pathId('userId', userId),
      departmentId: pathId('departmentId', departmentId),
    };
    const attribution = await actorAttribution(this.actors, request, reply);
    const result = await this.administration.removeMembership({ ...ids, ...input }, attribution);
    if (result.outcome !== 'removed') refuse(result);
    return { primaryDepartmentId: result.primaryDepartmentId ?? null };
  }

  @Post('roles')
  @IamRoute({
    permission: permission(IAM_PERMISSIONS.usersManageRoles),
    unsafe: true,
    params: ['userId'],
    body: refs.AssignRoleBody,
    success: { status: 201, description: 'The role is assigned.', schema: refs.RoleAssigned },
    errors: {
      403: '`IAM_GRANT_EXCEEDS_ACTOR`',
      404: `${USER_NOT_FOUND}, \`IAM_ROLE_NOT_FOUND\``,
      409: '`IAM_ROLE_INACTIVE`, `IAM_DUPLICATE_ROLE_ASSIGNMENT`',
    },
  })
  async assignRole(
    @Param('userId') userId: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const input = parseInput(AssignRoleBody, body);
    const id = pathId('userId', userId);
    const attribution = await actorAttribution(this.actors, request, reply, input.reason);
    const result = await this.administration.assignRole(
      { userId: id, roleId: input.roleId },
      attribution,
    );
    if (result.outcome !== 'assigned') refuse(result);
    return { userId: id, roleId: input.roleId };
  }

  @Delete('roles/:roleId')
  @HttpCode(204)
  @IamRoute({
    permission: permission(IAM_PERMISSIONS.usersManageRoles),
    unsafe: true,
    params: ['userId', 'roleId'],
    success: { status: 204, description: 'The role is removed.' },
    errors: {
      404: `${USER_NOT_FOUND}, \`IAM_ROLE_NOT_FOUND\`, \`IAM_ROLE_ASSIGNMENT_NOT_FOUND\``,
      409: '`IAM_LAST_SYSTEM_ADMIN`',
    },
  })
  async removeRole(
    @Param('userId') userId: string,
    @Param('roleId') roleId: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    parseInput(EmptyBody, body);
    const ids = { userId: pathId('userId', userId), roleId: pathId('roleId', roleId) };
    const attribution = await actorAttribution(this.actors, request, reply);
    const result = await this.administration.removeRole(ids, attribution);
    if (result.outcome !== 'removed') refuse(result);
  }
}
