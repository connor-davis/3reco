import type { Listing } from '@/lib/api/types';
import { toCents, toGrams } from '@/lib/format';

// The server owns search; sort only the displayed page.
export function filterListings(listings: Listing[], sort: string): Listing[] {
  return [...listings].sort((a, b) => {
    if (sort === 'price') return toCents(a.price) - toCents(b.price);
    if (sort === 'available') return toGrams(b.weight) - toGrams(a.weight);
    return 0;
  });
}
