import type { TradeRequest } from './api/types';

/** Who a pending trade is waiting for, from the viewer's side. */
export function waitingFor(
  request: Pick<
    TradeRequest,
    | 'buyer'
    | 'seller'
    | 'offer_version'
    | 'buyer_confirmed_version'
    | 'seller_confirmed_version'
  >,
  userId: string | undefined
): string {
  const buyerDone = request.buyer_confirmed_version === request.offer_version;
  const sellerDone = request.seller_confirmed_version === request.offer_version;

  if (buyerDone && sellerDone) return 'Both sides confirmed';

  if (userId === request.buyer.id) {
    if (!buyerDone) return 'Waiting for you';

    return 'Waiting for the seller';
  }

  if (userId === request.seller.id) {
    if (!sellerDone) return 'Waiting for you';

    return 'Waiting for the buyer';
  }

  if (!buyerDone && !sellerDone) return 'Waiting for both sides';

  return buyerDone ? 'Waiting for the seller' : 'Waiting for the buyer';
}
