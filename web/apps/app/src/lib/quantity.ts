import { formatKg, toGrams } from '@/lib/format';
import type { Listing } from '@/lib/types';

type Bounds = Pick<Listing, 'minKg' | 'availableKg'>;

/**
 * Why a weight cannot be ordered, or null when it can. One owner for the
 * listing, cart and offer paths so they never disagree.
 */
export function quantityError(value: string, bounds?: Bounds): string | null {
  const clean = value.trim().replace(',', '.');

  if (!/^\d+(\.\d{1,2})?$/.test(clean)) {
    return 'Enter a weight in kg, with up to 2 decimals.';
  }

  const grams = toGrams(clean);

  if (grams === 0) return 'Enter a weight above 0 kg.';
  if (!bounds) return null;

  if (grams < toGrams(bounds.minKg)) {
    return `The smallest order is ${formatKg(bounds.minKg)}.`;
  }

  if (grams > toGrams(bounds.availableKg)) {
    return `Only ${formatKg(bounds.availableKg)} is available.`;
  }

  return null;
}
