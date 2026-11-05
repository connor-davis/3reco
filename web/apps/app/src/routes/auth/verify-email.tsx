import { VerifyEmailPage } from '@/components/guards/authentication';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/auth/verify-email')({
  component: VerifyEmailPage,
});
