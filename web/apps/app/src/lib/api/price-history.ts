import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/use-auth';
import { api } from './client';
import { idPath } from './resource';

export interface PriceWeek {
  period: string;
  avg_price: string | null;
  status: 'available' | 'not_enough_deals';
}

export function useCanSeePrices() {
  const { user } = useAuth();
  return (
    user?.role === 'admin' ||
    user?.role === 'staff' ||
    (!!user?.active_business_id && !!user.business_role)
  );
}

export function usePriceHistory(materialId: string) {
  const allowed = useCanSeePrices();
  return useQuery({
    queryKey: ['price-history', materialId],
    queryFn: ({ signal }) =>
      api<{ weeks: PriceWeek[] }>(
        `/materials/${idPath(materialId)}/price-history`,
        { signal }
      ),
    enabled: allowed && !!materialId,
    // Other stores' private transaction events are not broadcast to this user.
    // Refocus refreshes this aggregate without polling or revealing a trade.
    staleTime: 5 * 60 * 1000,
    retry: (count, error) =>
      count < 2 && !('status' in error && Number(error.status) < 500),
  });
}
