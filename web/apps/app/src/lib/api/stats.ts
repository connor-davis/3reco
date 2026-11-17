import { useResource } from './resource';
import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import type * as T from './types';
import { useAuth } from '../auth/use-auth';

export interface ViewCounts {
  days_7: number;
  days_30: number;
  lifetime: number;
}

export interface SellerStats {
  views: ViewCounts;
  listings: {
    id: string;
    material_name: string;
    is_listed: boolean;
    views: ViewCounts;
  }[];
  replies: { requests: number; within_day: number };
}

export function useSellerStats() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['seller-stats', user?.active_business_id, user?.id],
    queryFn: ({ signal }) => api<SellerStats>('/stats/seller', { signal }),
    enabled: !!user?.active_business_id && !!user.business_role,
    refetchOnMount: 'always',
    retry: (count, error) =>
      count < 2 && !('status' in error && Number(error.status) < 500),
  });
}

export function useStats() {
  const { user } = useAuth();
  const enabled = !!user && user.role !== 'guest';
  const query = useResource<T.Stats>(['stats'], '/stats', true, enabled);
  // A disabled query will never finish loading; public pages omit its totals.
  return { ...query, isPending: enabled && query.isPending };
}
