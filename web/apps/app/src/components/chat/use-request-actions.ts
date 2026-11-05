import { toast } from 'sonner';
import { co2For, kgFor } from '@/lib/impact';
import { storeById } from '@/lib/data/stores';
import { useMock, useMockList } from '@/lib/mock/hooks';
import type { MarketRequest } from '@/lib/types';

/** Every change a person can make to a request. All of it is mock state. */
export function useRequestActions(request: MarketRequest) {
  const { setCelebrate } = useMock();
  const requests = useMockList('requests');
  const messages = useMockList('messages');
  const transactions = useMockList('transactions');

  function say(from: 'me' | 'system', text: string) {
    messages.append({
      id: `${request.id}-m${messages.items.length}`,
      requestId: request.id,
      from,
      text,
      sentAt: new Date().toISOString(),
    });
  }

  function setStatus(
    status: MarketRequest['status'],
    note: string,
    toastText: string
  ) {
    requests.update(request.id, {
      status,
      offerPending: false,
      preview: note,
      lastAt: 'Now',
    });
    say('system', note);
    toast.success(toastText);
  }

  return {
    send: (text: string) => {
      say('me', text);
      requests.update(request.id, { preview: text, lastAt: 'Now', unread: 0 });
    },
    accept: () => {
      // One transaction and invoice per material line, so stock and
      // invoices see the same lines the offer showed.
      const number = request.id.replace('REQ-', '');

      request.items.forEach((line, index) =>
        transactions.add({
          id: `TX-${number}-${index + 1}`,
          type: 'B2B',
          requestId: request.id,
          seller: storeById(request.sellerId).name,
          buyer: storeById(request.buyerId).name,
          materialId: line.materialId,
          kg: line.kg,
          pricePerKg: line.pricePerKg,
          status: 'Pending',
          date: new Date().toISOString().slice(0, 10),
          receipts: 0,
          invoiceNo: `INV-2026-${number}-${index + 1}`,
        })
      );
      setStatus(
        'Accepted',
        'Offer accepted. An invoice is on its way.',
        'Offer accepted.'
      );
      setCelebrate({ kg: kgFor(request.items), co2: co2For(request.items) });
    },
    decline: () => setStatus('Requested', 'Offer declined.', 'Offer declined.'),
    cancel: () =>
      setStatus('Cancelled', 'Request cancelled.', 'Request cancelled.'),
    reject: () =>
      setStatus('Rejected', 'Request rejected.', 'Request rejected.'),
    withdraw: () =>
      setStatus('Requested', 'Offer withdrawn.', 'Your offer was withdrawn.'),
  };
}
