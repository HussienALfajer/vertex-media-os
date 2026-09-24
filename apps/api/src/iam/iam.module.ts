import { type DynamicModule, Module } from '@nestjs/common';
import { createAuditRecorder } from '@vertex-os/audit-persistence';
import type { DatabaseClient } from '@vertex-os/database';
import { USER_SESSION_REVOCATION, type UserSessionRevocation } from '../auth/session-revocation.js';
import type { IdentityProvisioningConfig } from '../config/identity-provisioning-config.js';
import { DATABASE_CLIENT, DatabaseModule } from '../database/database.module.js';
import { createIamAdministration } from './administration.js';
import { createIamDirectory } from './directory.js';
import { IAM_ADMINISTRATION, IAM_DIRECTORY, IAM_USER_ADMINISTRATION } from './http/capabilities.js';
import { DepartmentsController } from './http/departments.controller.js';
import { MeController } from './http/me.controller.js';
import { PermissionsController, RolesController } from './http/roles.controller.js';
import { UserGrantsController } from './http/user-grants.controller.js';
import { UsersController } from './http/users.controller.js';
import { createIamUserAdministration } from './user-administration.js';

export interface IamModuleOptions {
  /** Replaces `fetch` for the Keycloak Admin adapter (tests fault or redirect the transport). */
  readonly identityFetch?: typeof fetch;
}

/**
 * MOD-IAM's HTTP surface (spec Section 25; IAM-R07 D-01): the bound capabilities, composed over
 * the process's database client, the Audit adapter, the Keycloak Admin adapter and the
 * authentication area's session revocation, and the controllers that expose them.
 */
@Module({})
export class IamModule {
  static forRoot(
    provisioning: IdentityProvisioningConfig,
    options: IamModuleOptions = {},
  ): DynamicModule {
    return {
      module: IamModule,
      imports: [DatabaseModule],
      controllers: [
        MeController,
        UsersController,
        UserGrantsController,
        DepartmentsController,
        RolesController,
        PermissionsController,
      ],
      providers: [
        {
          provide: IAM_ADMINISTRATION,
          inject: [DATABASE_CLIENT],
          useFactory: (database: DatabaseClient) =>
            createIamAdministration(database, { auditRecorderFor: createAuditRecorder }),
        },
        {
          provide: IAM_USER_ADMINISTRATION,
          inject: [DATABASE_CLIENT, USER_SESSION_REVOCATION],
          useFactory: (database: DatabaseClient, sessions: UserSessionRevocation) =>
            createIamUserAdministration(provisioning, database, {
              // Bound to `AuthRuntime.sessions` (IAM-R07 D-09; IAM-R06 review AB-1).
              revokeUserSessions: sessions.revokeUserSessions,
              ...(options.identityFetch === undefined ? {} : { fetch: options.identityFetch }),
            }),
        },
        {
          provide: IAM_DIRECTORY,
          inject: [DATABASE_CLIENT],
          useFactory: (database: DatabaseClient) => createIamDirectory(database),
        },
      ],
    };
  }
}
