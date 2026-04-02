import AuthenticationGuard from '@/components/guards/authentication';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/auth/reset-password')({
  component: ResetPasswordRoute,
});

function ResetPasswordRoute() {
  return (
    <div className="flex min-h-dvh w-full flex-col bg-transparent text-foreground">
      <AuthenticationGuard />
    </div>
  );
}
