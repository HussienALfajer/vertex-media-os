import {
  IamIdentitySyncState,
  IamInvitationDeliveryState,
  IamUserAccessState,
} from '@vertex-os/database/persistence';
import type {
  IdentitySyncState,
  InvitationDeliveryState,
  UserAccessState,
} from '@vertex-os/iam/persistence';

export const accessToDatabase = {
  INVITED: IamUserAccessState.INVITED,
  ACTIVE: IamUserAccessState.ACTIVE,
  SUSPENDED: IamUserAccessState.SUSPENDED,
  DISABLED: IamUserAccessState.DISABLED,
  TERMINATED: IamUserAccessState.TERMINATED,
} satisfies Record<UserAccessState, IamUserAccessState>;

export const accessFromDatabase = {
  INVITED: 'INVITED',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  DISABLED: 'DISABLED',
  TERMINATED: 'TERMINATED',
} satisfies Record<IamUserAccessState, UserAccessState>;

export const identitySyncToDatabase = {
  PENDING: IamIdentitySyncState.PENDING,
  SYNCED: IamIdentitySyncState.SYNCED,
  FAILED: IamIdentitySyncState.FAILED,
} satisfies Record<IdentitySyncState, IamIdentitySyncState>;

export const identitySyncFromDatabase = {
  PENDING: 'PENDING',
  SYNCED: 'SYNCED',
  FAILED: 'FAILED',
} satisfies Record<IamIdentitySyncState, IdentitySyncState>;

export const invitationToDatabase = {
  NOT_SENT: IamInvitationDeliveryState.NOT_SENT,
  SENT: IamInvitationDeliveryState.SENT,
  FAILED: IamInvitationDeliveryState.FAILED,
} satisfies Record<InvitationDeliveryState, IamInvitationDeliveryState>;

export const invitationFromDatabase = {
  NOT_SENT: 'NOT_SENT',
  SENT: 'SENT',
  FAILED: 'FAILED',
} satisfies Record<IamInvitationDeliveryState, InvitationDeliveryState>;
