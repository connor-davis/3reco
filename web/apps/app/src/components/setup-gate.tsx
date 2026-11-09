import type { ReactNode } from 'react';
import { Navigate, useRouterState } from '@tanstack/react-router';
import { useAuth } from '@/lib/auth/use-auth';
import { needsSetup } from '@/lib/setup';

/** Sends a signed-in person who has not finished setup to /setup. */
export function SetupGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  if (needsSetup(user, pathname)) return <Navigate to="/setup" replace />;

  return <>{children}</>;
}
