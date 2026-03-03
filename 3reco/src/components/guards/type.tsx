import { useConvexQuery } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import type { ReactNode } from 'react';

export default function TypeGuard({
  type,
  children,
}: {
  type: string | string[];
  children: ReactNode;
}) {
  const user = useConvexQuery(api.users.currentUser);

  if (!user) return undefined;
  if (!user.type) return undefined;

  if (typeof type === 'string') {
    return user.type === type ? children : undefined;
  } else {
    return type.includes(user.type) ? children : undefined;
  }
}
