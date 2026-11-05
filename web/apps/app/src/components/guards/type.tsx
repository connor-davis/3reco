import type { ReactNode } from 'react';
import { useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';

export default function TypeGuard({
  type,
  children,
}: {
  type: string | string[];
  children: ReactNode;
}) {
  const currentUser = useQuery(api.users.currentUser);

  // undefined = loading, null = not logged in
  if (currentUser === undefined || currentUser === null) return undefined;

  const role = currentUser.role;
  if (!role) return undefined;

  if (typeof type === 'string') {
    return role === type ? children : undefined;
  } else {
    return type.includes(role) ? children : undefined;
  }
}
