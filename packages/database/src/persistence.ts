import { persistenceClientOf } from './database-client.js';

export { persistenceClientOf };
export type PersistenceClient = ReturnType<typeof persistenceClientOf>;
export type { IamApplicationUser } from './generated/prisma/client.js';
export {
  IamUserAccessState,
  IamIdentitySyncState,
  IamInvitationDeliveryState,
  IamDepartmentState,
  IamRoleState,
  IamPermissionState,
  IamPermissionSensitivity,
} from './generated/prisma/enums.js';
