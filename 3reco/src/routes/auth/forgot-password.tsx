import { ForgotPasswordPage } from '@/components/guards/authentication';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/auth/forgot-password')({
  component: ForgotPasswordPage,
});
