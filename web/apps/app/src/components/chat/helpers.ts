import { myStoreId, storeById } from '@/lib/data/stores';
import { lineCents } from '@/lib/format';
import type { MarketRequest } from '@/lib/types';

/** The other side of a request, from the signed-in business's point of view. */
export function counterpartyOf(request: MarketRequest) {
  const otherId =
    request.buyerId === myStoreId ? request.sellerId : request.buyerId;

  return storeById(otherId);
}

/** Sum of all lines, in cents. */
export function requestTotal(request: MarketRequest): number {
  return request.items.reduce(
    (sum, line) => sum + lineCents(line.pricePerKg, line.kg),
    0
  );
}

const closed = ['Completed', 'Rejected', 'Cancelled'];

export function isClosed(request: MarketRequest): boolean {
  return closed.includes(request.status);
}

/** True when the signed-in business is the seller on this request. */
export function iAmSeller(request: MarketRequest): boolean {
  return request.sellerId === myStoreId;
}

/** True when the signed-in business is the buyer on this request. */
export function iAmBuyer(request: MarketRequest): boolean {
  return request.buyerId === myStoreId;
}

const offerable = ['Requested', 'Offer sent', 'Counter'];

/** The seller makes the offer, so only the seller sees "Make offer". */
export function canMakeOffer(request: MarketRequest): boolean {
  return iAmSeller(request) && offerable.includes(request.status);
}

/** Only the buyer can accept or decline. An offer is never answered by its author. */
export function canRespond(request: MarketRequest): boolean {
  return iAmBuyer(request) && request.offerPending;
}
