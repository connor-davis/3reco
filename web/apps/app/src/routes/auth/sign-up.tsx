import { SignUpPage } from '@/components/guards/authentication';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/auth/sign-up')({
  component: SignUpPage,
});
