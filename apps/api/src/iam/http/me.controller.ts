import { Controller, Get, Inject, Req, Res, UseInterceptors } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { CURRENT_ACTOR, type CurrentActor } from '../../auth/access.guard.js';
import { IAM_DIRECTORY, type IamDirectory } from './capabilities.js';
import { IamRoute } from './docs.js';
import { NoStoreInterceptor } from './request.js';
import { refs, type MeResponse } from './schemas.js';

/**
 * The current user (spec Section 25.2; IAM-R07 D-12). Any ACTIVE session may ask. The permission
 * codes, the ACTIVE departments and the primary come from the authorization context, the
 * authority for what the user may do; the directory adds only the profile and department names.
 */
@ApiTags('iam')
@Controller('iam/me')
@UseInterceptors(NoStoreInterceptor)
export class MeController {
  constructor(
    @Inject(CURRENT_ACTOR) private readonly actors: CurrentActor,
    @Inject(IAM_DIRECTORY) private readonly directory: IamDirectory,
  ) {}

  @Get()
  @IamRoute({
    permission: undefined,
    unsafe: false,
    success: {
      status: 200,
      description: 'The profile, ACTIVE departments and effective permission codes.',
      schema: refs.Me,
    },
  })
  async me(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<MeResponse> {
    const context = await this.actors.require(request, reply);
    const result = await this.directory.getUser({ userId: context.userId });
    // The session's user was ACTIVE a moment ago and users are never deleted (spec Section 29).
    if (result.outcome !== 'found') throw new Error('The current user disappeared.');
    const names = new Map(
      result.user.departments.map((department) => [department.id, department] as const),
    );
    return {
      user: { id: result.user.id, email: result.user.email, displayName: result.user.displayName },
      departments: context.departmentIds.flatMap((id) => {
        const department = names.get(id);
        return department === undefined
          ? []
          : [
              {
                id,
                code: department.code,
                name: department.name,
                isPrimary: id === context.primaryDepartmentId,
              },
            ];
      }),
      permissionCodes: [...context.permissionCodes],
    };
  }
}
