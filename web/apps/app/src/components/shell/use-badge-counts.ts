import { canOpen } from '@/lib/access';
import { useInbox } from '@/lib/api/messages';
import { queryString, type Page } from '@/lib/api/paging';
import { useResource } from '@/lib/api/resource';
import type { TradeRequest } from '@/lib/api/types';
import { useAuth } from '@/lib/auth/use-auth';

/**
 * The small numbers on nav links and tabs. Messages counts threads with
 * unread messages; incoming counts requests still waiting for the seller.
 * Only the first page is read, which is enough for a badge. Each count asks
 * only when the role has that page, so nobody earns a 401 or 403 for it.
 */
export function useBadgeCounts() {
  const { user } = useAuth();
  const inbox = useInbox({ limit: 100 });
  // Same key as useRequests('incoming', { limit: 100 }), so the cache is shared.
  const params = { limit: 100 };
  const incoming = useResource<Page<TradeRequest>>(
    ['requests', 'incoming', params],
    `/requests/incoming${queryString(params)}`,
    true,
    !!user && canOpen(user.role, 'incoming')
  );

  if (!user) return { messages: 0, incoming: 0 };

  return {
    messages:
      inbox.data?.items.filter((thread) => thread.unread_count > 0).length ?? 0,
    incoming:
      incoming.data?.items.filter((request) => request.status === 'pending')
        .length ?? 0,
  };
}
