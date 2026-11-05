import { formatKg, toGrams } from '@/lib/format';
/**
 * Why a weight cannot be ordered, or null when it can. One owner for the
 * listing, cart and offer paths so they never disagree.
 */
export function quantityError(
  value: string,
  availableKg?: string
): string | null {
  const clean = value.trim().replace(',', '.');

  if (!/^\d+(\.\d{1,2})?$/.test(clean)) {
    return 'Enter a weight in kg, with up to 2 decimals.';
  }

  const grams = toGrams(clean);

  if (grams === 0) return 'Enter a weight above 0 kg.';

  if (availableKg && grams > toGrams(availableKg)) {
    return `Only ${formatKg(availableKg)} is available.`;
  }

  return null;
}
