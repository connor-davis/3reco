import { useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/use-auth';
import { ApiError } from '@/lib/api/client';
import {
  useAcceptRequest,
  useCreateRequest,
  useRequestAction,
} from '@/lib/api/requests';
import { useSendMessage } from '@/lib/api/messages';
import type { Listing, TradeRequest } from '@/lib/api/types';

export function useStartChat() {
  const create = useCreateRequest();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  async function startChat(listing: Listing) {
    setError(null);
    if (user?.role !== 'business') {
      setError('Sign in as a business to message sellers.');
      return false;
    }

    try {
      const result = await create.mutateAsync({
        seller_id: listing.seller_id,
        items: [
          {
            material_id: listing.material_id,
            stock_id: listing.id,
            weight: listing.weight,
          },
        ],
      });
      await navigate({
        to: '/messages/$requestId',
        params: { requestId: result.id },
      });
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not start this conversation.'
      );
      return false;
    }
  }

  return { startChat, error, isPending: create.isPending };
}

export function useRequestActions(request: TradeRequest) {
  const send = useSendMessage(request.id);
  const sending = useRef(false);
  const accept = useAcceptRequest(request.id);
  const decline = useRequestAction(request.id, 'decline');
  const cancel = useRequestAction(request.id, 'cancel');
  const reject = useRequestAction(request.id, 'reject');
  const withdraw = useRequestAction(request.id, 'withdraw');
  const client = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [transactionId, setTransactionId] = useState<string>();

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not update this request.'
      );
      if (cause instanceof ApiError && cause.status === 409) {
        await client.invalidateQueries({ queryKey: ['requests', request.id] });
      }
      return false;
    }
  }

  return {
    error,
    transactionId,
    isPending: [send, accept, decline, cancel, reject, withdraw].some(
      (mutation) => mutation.isPending
    ),
    send: async (content: string) => {
      // React's pending state may not render before another submit arrives.
      if (sending.current) return false;

      sending.current = true;
      try {
        return await run(() => send.mutateAsync({ content }));
      } finally {
        sending.current = false;
      }
    },
    accept: () =>
      run(async () => {
        const result = await accept.mutateAsync({
          offer_version: request.offer_version,
        });
        setTransactionId(result.transaction_id);
      }),
    decline: () => run(() => decline.mutateAsync()),
    cancel: () => run(() => cancel.mutateAsync()),
    reject: () => run(() => reject.mutateAsync()),
    withdraw: () => run(() => withdraw.mutateAsync()),
  };
}
