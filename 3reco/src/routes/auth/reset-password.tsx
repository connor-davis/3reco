import { ResetPasswordPage } from '@/components/guards/authentication';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/auth/reset-password')({
  component: ResetPasswordPage,
});
