import { useConvexQuery } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import type { ReactNode } from 'react';

/**
 * Renders `children` only when the signed-in user's WorkOS role matches
 * one of the provided `roles`. Uses the same role strings configured in
 * WorkOS: 'admin' | 'staff' | 'business' | 'collector'.
 */
export default function RoleGuard({
  roles,
  children,
}: {
  roles: string | string[];
  children: ReactNode;
}) {
  const user = useConvexQuery(api.users.currentUser);

  if (!user) return undefined;
  if (!user.role) return undefined;

  const allowed = typeof roles === 'string' ? [roles] : roles;
  return allowed.includes(user.role) ? children : undefined;
}
