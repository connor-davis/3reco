import { useMock } from '@/lib/mock/hooks';
import { myStoreId } from '@/lib/data/stores';

/** The small numbers on nav links and tabs, worked out from mock state. */
export function useBadgeCounts() {
  const { data, cart } = useMock();

  const mine = data.requests.filter(
    (request) => request.buyerId === myStoreId || request.sellerId === myStoreId
  );
  const incoming = mine.filter(
    (request) =>
      request.sellerId === myStoreId &&
      request.status !== 'Completed' &&
      request.status !== 'Cancelled'
  );

  return {
    messages: mine.filter((request) => request.unread > 0).length,
    cart: cart.length,
    incoming: incoming.length,
  };
}
