import type { CartInput, CartItem, Listing, Transaction } from './api/types';
import { toGrams } from './format';

/** Keep other cart lines and replace repeated stock with today's capped weight. */
export function mergeReorder(
  items: Transaction['items'],
  listings: Listing[],
  cart: CartItem[]
): { lines: CartInput['items']; skipped: string[] } {
  const lines = new Map(
    cart.map((item) => [
      item.stock_id,
      {
        stock_id: item.stock_id,
        material_id: item.material_id,
        weight: item.weight ?? '',
      },
    ])
  );
  const skipped: string[] = [];

  for (const item of items) {
    const listing = listings.find(
      (listed) => listed.material_id === item.material_id
    );
    if (!listing || toGrams(listing.weight) <= 0 || toGrams(item.weight) <= 0) {
      skipped.push(item.material_name);
      continue;
    }

    lines.set(listing.id, {
      stock_id: listing.id,
      material_id: item.material_id,
      weight:
        toGrams(item.weight) <= toGrams(listing.weight)
          ? item.weight
          : listing.weight,
    });
  }

  return { lines: [...lines.values()], skipped };
}
