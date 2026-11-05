import { lowestRate } from '@/lib/data/listings';
import { materialById } from '@/lib/data/materials';
import { storeById } from '@/lib/data/stores';
import { toCents, toGrams } from '@/lib/format';
import type { Listing } from '@/lib/types';
import type { MarketFilterValues } from './market-filters';

/** Applies the toolbar's search, filters and sort to the listings. */
export function filterListings(
  listings: Listing[],
  filters: MarketFilterValues
): Listing[] {
  const query = filters.query.trim().toLowerCase();

  const kept = listings.filter((listing) => {
    if (!listing.listed) return false;

    const store = storeById(listing.storeId);
    const material = materialById(listing.materialId);

    if (filters.city !== 'all' && store.city !== filters.city) return false;
    if (filters.category !== 'all' && material.category !== filters.category) {
      return false;
    }
    if (filters.verifiedOnly && !store.verified) return false;

    const haystack = `${listing.title} ${store.name} ${store.suburb} ${store.city}`;

    return haystack.toLowerCase().includes(query);
  });

  return [...kept].sort(
    (a, b) => sortValue(a, filters.sort) - sortValue(b, filters.sort)
  );
}

// Lower sorts first. "Recommended" keeps the seed order.
function sortValue(listing: Listing, sort: string): number {
  if (sort === 'price') return toCents(lowestRate(listing));
  if (sort === 'available') return -toGrams(listing.availableKg);
  if (sort === 'co2') {
    const factor = toGrams(materialById(listing.materialId).carbonFactor);

    return -(toGrams(listing.availableKg) * factor);
  }

  return 0;
}
