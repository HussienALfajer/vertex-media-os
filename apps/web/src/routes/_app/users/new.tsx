import { createFileRoute } from '@tanstack/react-router';
import { CreateUser } from '../../../features/iam/users/create-user';

export const Route = createFileRoute('/_app/users/new')({
  component: CreateUser,
});
