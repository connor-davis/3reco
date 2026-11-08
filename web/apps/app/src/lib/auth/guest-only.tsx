import type { ReactNode } from 'react';
import { Navigate, useRouterState } from '@tanstack/react-router';
import { RowsSkeleton } from '@/components/data-state';
import { useAuth } from './use-auth';

import { authDestination, guestAuthPages } from './redirect';

/** Existing sessions skip guest forms, except an explicit Add account flow. */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const location = useRouterState({ select: (state) => state.location });
  const params = new URLSearchParams(location.searchStr);
  const adding =
    location.pathname === '/sign-in' &&
    ['1', 'true'].includes(params.get('add') ?? '');
  // Emailed token links perform an action even when another account is active.
  const tokenAction =
    ['/reset-password', '/verify-email'].includes(location.pathname) &&
    !!params.get('token');

  if (!guestAuthPages.includes(location.pathname) || tokenAction || adding) {
    return <>{children}</>;
  }
  if (isLoading) return <RowsSkeleton />;
  if (user)
    return <Navigate to={authDestination(params.get('redirect'))} replace />;

  return <>{children}</>;
}
