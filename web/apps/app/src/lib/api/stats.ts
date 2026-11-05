import { useResource } from './resource';
import type * as T from './types';
import { useAuth } from '../auth/use-auth';

export function useStats() {
  const { user } = useAuth();
  return useResource<T.Stats>(['stats'], '/stats', [
    user?.role === 'admin' || user?.role === 'staff'
      ? 'admin:transactions'
      : 'transactions:me',
    'materials',
  ]);
}
