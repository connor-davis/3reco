import { useResource } from './resource';
import type * as T from './types';
import { useAuth } from '../auth/use-auth';

export function useStats() {
  const { user } = useAuth();
  const enabled = !!user && user.role !== 'guest';
  const query = useResource<T.Stats>(['stats'], '/stats', true, enabled);
  // A disabled query will never finish loading; public pages omit its totals.
  return { ...query, isPending: enabled && query.isPending };
}
