import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { myStoreId } from '@/lib/data/stores';
import { useMock, useMockList } from '@/lib/mock/hooks';
import type { Listing, MarketRequest } from '@/lib/types';

/**
 * "Ask" and "Message seller": a business opens a request to the store (or
 * reuses the open one). Anyone else is sent to sign in.
 */
export function useStartChat() {
  const { role } = useMock();
  const navigate = useNavigate();
  const requests = useMockList('requests');

  return function startChat(listing: Listing, kg?: string) {
    if (role !== 'business') {
      toast('Sign in as a business to message sellers.');
      navigate({ to: '/sign-in' });
      return;
    }

    const open = requests.items.find(
      (request) =>
        request.buyerId === myStoreId &&
        request.sellerId === listing.storeId &&
        request.status !== 'Completed' &&
        request.status !== 'Rejected' &&
        request.status !== 'Cancelled'
    );

    if (open) {
      navigate({ to: '/messages/$requestId', params: { requestId: open.id } });
      return;
    }

    const created: MarketRequest = {
      id: `REQ-${1100 + requests.items.length}`,
      buyerId: myStoreId,
      sellerId: listing.storeId,
      status: 'Requested',
      createdAt: new Date().toISOString(),
      items: [
        {
          materialId: listing.materialId,
          kg: kg ?? listing.minKg,
          pricePerKg: listing.priceBreaks[0].pricePerKg,
        },
      ],
      collection: { area: 'To be agreed', window: 'To be agreed' },
      offerPending: false,
      unread: 0,
      preview: 'You started this request.',
      lastAt: 'Now',
    };

    requests.add(created);
    toast.success('Request started. Say hello.');
    navigate({ to: '/messages/$requestId', params: { requestId: created.id } });
  };
}
