import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  Alert,
  Bdi,
  Breadcrumb,
  Button,
  DescriptionList,
  EmptyState,
  ErrorState,
  InstantText,
  LoadingState,
  LtrText,
  Page,
  PageHeader,
  RecordHeader,
  type DescriptionItem,
} from '@vertex-os/ui';
import { useState } from 'react';
import { isApiProblem } from '../../../lib/http';
import { useAccess } from '../../auth/use-access';
import { useIamMessages } from '../iam-messages';
import { IAM_PERMISSIONS, userQuery } from '../iam-queries';
import { AccessStatus } from '../iam-states';
import { AccessActions } from './access-actions';
import { EditNameDialog } from './edit-name-dialog';
import type { Outcome } from './outcome';
import { UserMemberships } from './user-memberships';
import { UserRoles } from './user-roles';

/**
 * One user (spec Sections 25.3, 40): identity, the three separately labeled facts, profile,
 * memberships, roles, and the actions the administrator's permissions allow. Every result is the
 * one the API reported (IAM-R08B D-10).
 */
export function UserDetailPage({ userId, created }: { userId: string; created: boolean }) {
  const messages = useIamMessages();
  const navigate = useNavigate();
  const { can } = useAccess();
  const user = useQuery(userQuery(userId));
  const [outcome, setOutcome] = useState<Outcome | undefined>(
    created
      ? { tone: 'success', title: messages.createdTitle, detail: messages.createdDetail }
      : undefined,
  );
  const [editing, setEditing] = useState(false);
  const breadcrumb = (current: string) => (
    <Breadcrumb items={[{ label: messages.users, href: '/users' }, { label: current }]} />
  );

  if (user.data === undefined) {
    const notFound = isApiProblem(user.error, 404);
    const denied = isApiProblem(user.error, 403);
    return (
      <Page width="detail">
        <PageHeader
          breadcrumb={breadcrumb(messages.users)}
          title={notFound ? messages.userNotFoundTitle : messages.users}
        />
        {notFound ? (
          <EmptyState
            icon="user"
            title={messages.userNotFoundTitle}
            description={messages.userNotFoundDetail}
            action={
              <Button onClick={() => void navigate({ to: '/users' })}>
                {messages.backToUsers}
              </Button>
            }
            headingLevel={2}
          />
        ) : denied ? (
          <EmptyState
            icon="lock"
            title={messages.noPermissionTitle}
            description={messages.noPermissionDetail}
            headingLevel={2}
          />
        ) : user.isError ? (
          <ErrorState
            title={messages.userLoadFailed}
            description={messages.loadFailedDetail}
            onRetry={() => void user.refetch()}
            retrying={user.isFetching}
            headingLevel={2}
          />
        ) : (
          <LoadingState label={messages.loadingUser} />
        )}
      </Page>
    );
  }

  const detail = user.data;
  const facts: DescriptionItem[] = [
    { term: messages.columnAccess, details: <AccessStatus state={detail.accessState} /> },
  ];

  return (
    <Page width="detail">
      <RecordHeader
        breadcrumb={breadcrumb(detail.displayName)}
        title={<Bdi>{detail.displayName}</Bdi>}
        identifier={<LtrText>{detail.email}</LtrText>}
        statuses={<AccessStatus state={detail.accessState} />}
        actions={
          <>
            {can(IAM_PERMISSIONS.usersUpdate) && (
              <Button icon="form" onClick={() => setEditing(true)}>
                {messages.editName}
              </Button>
            )}
            <AccessActions user={detail} onOutcome={setOutcome} />
          </>
        }
      />
      <div className="flex flex-col gap-section">
        {outcome !== undefined && (
          <Alert
            tone={outcome.tone}
            title={outcome.title}
            announce
            onDismiss={() => setOutcome(undefined)}
          >
            {outcome.detail}
          </Alert>
        )}
        <section aria-labelledby="user-status" className="flex flex-col gap-form-fields">
          <h2 id="user-status" className="type-section-title">
            {messages.statusFacts}
          </h2>
          <DescriptionList items={facts} />
        </section>
        <section aria-labelledby="user-profile" className="flex flex-col gap-form-fields">
          <h2 id="user-profile" className="type-section-title">
            {messages.profile}
          </h2>
          <DescriptionList
            items={[
              { term: messages.email, details: <LtrText>{detail.email}</LtrText> },
              { term: messages.displayName, details: <Bdi>{detail.displayName}</Bdi> },
              { term: messages.createdAt, details: <InstantText value={detail.createdAt} /> },
              {
                term: messages.firstActivated,
                details:
                  detail.firstActivatedAt === null ? (
                    messages.notActivated
                  ) : (
                    <InstantText value={detail.firstActivatedAt} />
                  ),
              },
              {
                term: messages.lastAccessChange,
                details: <InstantText value={detail.lastAccessStateChangedAt} />,
              },
            ]}
          />
        </section>
        <UserMemberships user={detail} onOutcome={setOutcome} />
        <UserRoles user={detail} onOutcome={setOutcome} />
      </div>
      {editing && (
        <EditNameDialog
          user={detail}
          open={editing}
          onOpenChange={setEditing}
          onOutcome={setOutcome}
        />
      )}
    </Page>
  );
}
