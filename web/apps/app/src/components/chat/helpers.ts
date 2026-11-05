import { lineCents } from '@/lib/format';
import type { TradeRequest, Message } from '@/lib/api/types';

export function counterpartyOf(request: TradeRequest, userId?: string) {
  return request.buyer.id === userId ? request.seller : request.buyer;
}

export function requestTotal(request: TradeRequest): number {
  return request.items.reduce(
    (sum, item) =>
      sum + lineCents(item.offer_price ?? '0', item.offer_weight ?? '0'),
    0
  );
}

export function isClosed(request: TradeRequest): boolean {
  return ['accepted', 'rejected', 'cancelled'].includes(request.status);
}

export function canMakeOffer(request: TradeRequest, userId?: string): boolean {
  return request.seller.id === userId && !isClosed(request);
}

export function canRespond(request: TradeRequest, userId?: string): boolean {
  return request.buyer.id === userId && request.status === 'offered';
}

export function orderedMessages(messages: Message[]): Message[] {
  return [
    ...new Map(messages.map((message) => [message.id, message])).values(),
  ].sort(
    (a, b) =>
      Date.parse(a.created_at) - Date.parse(b.created_at) ||
      a.id.localeCompare(b.id)
  );
}
