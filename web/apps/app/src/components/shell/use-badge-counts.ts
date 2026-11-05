import { useInbox } from '@/lib/api/messages';
import { useRequests } from '@/lib/api/requests';
import { useAuth } from '@/lib/auth/use-auth';

/**
 * The small numbers on nav links and tabs. Messages counts threads with
 * unread messages; incoming counts requests still waiting for the seller.
 * Only the first page is read, which is enough for a badge.
 */
export function useBadgeCounts() {
  const { user } = useAuth();
  const inbox = useInbox({ limit: 100 });
  const incoming = useRequests('incoming', { limit: 100 });

  if (!user) return { messages: 0, incoming: 0 };

  return {
    messages:
      inbox.data?.items.filter((thread) => thread.unread_count > 0).length ?? 0,
    incoming:
      incoming.data?.items.filter((request) => request.status === 'pending')
        .length ?? 0,
  };
}
