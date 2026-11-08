import { lineCents } from '@/lib/format';
import type { TradeRequest, Message, Thread } from '@/lib/api/types';

/** The server keeps "[removed]" for a deleted person's message; show words. */
export function messageText(content: string): string {
  return content === '[removed]' ? 'Message removed' : content;
}

export function requestLabel(request: TradeRequest, userId?: string): string {
  if (request.status !== 'offered') return request.status;
  if (userId !== request.buyer.id && userId !== request.seller.id)
    return 'Offer awaiting confirmation';
  const own =
    userId === request.buyer.id
      ? request.buyer_confirmed_version
      : request.seller_confirmed_version;
  const other =
    userId === request.buyer.id
      ? request.seller_confirmed_version
      : request.buyer_confirmed_version;
  if (own === request.offer_version)
    return `Waiting for ${counterpartyOf(request, userId).name} to confirm`;
  if (other === request.offer_version) return 'Waiting for you to confirm';
  return request.offer_by === userId ? 'Offer sent' : 'Offer received';
}

/** The one line under an offer: what happens next, naming the other side. */
export function offerStatusLine(
  request: TradeRequest,
  userId?: string
): string {
  const other = counterpartyOf(request, userId).name;
  const own =
    userId === request.buyer.id
      ? request.buyer_confirmed_version
      : request.seller_confirmed_version;
  const theirs =
    userId === request.buyer.id
      ? request.seller_confirmed_version
      : request.buyer_confirmed_version;

  if (request.status !== 'offered') return `Current status: ${request.status}.`;
  if (own === request.offer_version) return `Waiting for ${other} to confirm.`;
  if (theirs === request.offer_version)
    return `${other} accepted this offer. Please confirm to complete the deal.`;
  if (request.offer_by === userId)
    return `Offer sent. Waiting for ${other} to respond.`;

  return `${other} sent this offer. Please confirm or reject it.`;
}

export function threadSummary(thread: Thread, userId?: string): string {
  if (['accepted', 'cancelled', 'rejected'].includes(thread.status))
    return `${thread.buyer.name} and ${thread.seller.name}`;
  if (thread.status !== 'offered') return 'Awaiting offer';
  const author =
    thread.offer_by === thread.buyer.id
      ? thread.buyer.name
      : thread.seller.name;
  const waiting = [
    thread.buyer_confirmed_version !== thread.offer_version
      ? thread.buyer
      : null,
    thread.seller_confirmed_version !== thread.offer_version
      ? thread.seller
      : null,
  ].filter((side) => side !== null);
  // Say "you" for the viewer, so a row reads short.
  const names = waiting.map((side) => (side.id === userId ? 'you' : side.name));
  return `Offer by ${author} · ${waiting.length ? `Waiting for ${names.join(' and ')}` : 'Both sides confirmed'}`;
}

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
  const participant =
    request.seller.id === userId || request.buyer.id === userId;
  return (
    participant &&
    !isClosed(request) &&
    (request.status === 'pending' || request.offer_by !== userId)
  );
}

export function canRespond(request: TradeRequest, userId?: string): boolean {
  if (
    request.status !== 'offered' ||
    (request.seller.id !== userId && request.buyer.id !== userId)
  )
    return false;
  const confirmed =
    userId === request.buyer.id
      ? request.buyer_confirmed_version
      : request.seller_confirmed_version;
  const otherConfirmed =
    userId === request.buyer.id
      ? request.seller_confirmed_version
      : request.buyer_confirmed_version;
  return (
    confirmed !== request.offer_version &&
    (request.offer_by !== userId || otherConfirmed === request.offer_version)
  );
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
