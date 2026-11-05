import { toGrams } from '@/lib/format';
import type { Listing, PriceBreak } from '@/lib/types';

// Price breaks start at 0 kg, then 1 000 kg and 5 000 kg (04 trade hub).
function breaks(base: string, mid: string, top: string) {
  return [
    { fromKg: '0', pricePerKg: base },
    { fromKg: '1000', pricePerKg: mid },
    { fromKg: '5000', pricePerKg: top },
  ];
}

export const seedListings: Listing[] = [
  {
    id: 'lst-101',
    storeId: 'jozi-circular',
    materialId: 'pet-clear',
    title: 'Clear PET bottles, baled',
    availableKg: '6400',
    minKg: '50',
    listed: true,
    priceBreaks: breaks('4.60', '4.40', '4.00'),
  },
  {
    id: 'lst-102',
    storeId: 'jozi-circular',
    materialId: 'hdpe-natural',
    title: 'Natural HDPE, shredded',
    availableKg: '1800',
    minKg: '50',
    listed: true,
    priceBreaks: breaks('7.20', '7.00', '6.80'),
  },
  {
    id: 'lst-103',
    storeId: 'cape-paper',
    materialId: 'cardboard',
    title: 'Baled cardboard',
    availableKg: '12000',
    minKg: '100',
    listed: true,
    priceBreaks: breaks('1.65', '1.55', '1.45'),
  },
  {
    id: 'lst-104',
    storeId: 'green-loop',
    materialId: 'aluminium',
    title: 'Aluminium cans, pressed',
    availableKg: '800',
    minKg: '25',
    listed: true,
    priceBreaks: breaks('18.50', '18.00', '17.50'),
  },
  {
    id: 'lst-105',
    storeId: 'east-rand',
    materialId: 'steel',
    title: 'Scrap steel, cut',
    availableKg: '5200',
    minKg: '200',
    listed: true,
    priceBreaks: breaks('3.40', '3.20', '3.00'),
  },
  {
    id: 'lst-106',
    storeId: 'jozi-circular',
    materialId: 'glass',
    title: 'Mixed glass, sorted',
    availableKg: '3500',
    minKg: '100',
    listed: true,
    priceBreaks: breaks('0.85', '0.80', '0.75'),
  },
];

// The business's own stock. Same shape as a listing, with a listed toggle.
export const seedStock: Listing[] = [
  {
    id: 'stk-201',
    storeId: 'ubuntu-recycling',
    materialId: 'pet-clear',
    title: 'Clear PET bottles',
    availableKg: '2400',
    minKg: '50',
    listed: true,
    priceBreaks: breaks('4.80', '4.60', '4.20'),
  },
  {
    id: 'stk-202',
    storeId: 'ubuntu-recycling',
    materialId: 'cardboard',
    title: 'Baled cardboard',
    availableKg: '3100',
    minKg: '100',
    listed: true,
    priceBreaks: breaks('1.70', '1.60', '1.50'),
  },
  {
    id: 'stk-203',
    storeId: 'ubuntu-recycling',
    materialId: 'aluminium',
    title: 'Aluminium cans',
    availableKg: '640',
    minKg: '25',
    listed: false,
    priceBreaks: breaks('18.80', '18.40', '18.00'),
  },
  {
    id: 'stk-204',
    storeId: 'ubuntu-recycling',
    materialId: 'steel',
    title: 'Scrap steel',
    availableKg: '1110',
    minKg: '200',
    listed: true,
    priceBreaks: breaks('3.50', '3.30', '3.10'),
  },
];

/** Tiers a buyer can actually reach: the lot must hold the tier's weight. */
export function reachableBreaks(listing: Listing): PriceBreak[] {
  const reachable = listing.priceBreaks.filter(
    (tier) => toGrams(tier.fromKg) <= toGrams(listing.availableKg)
  );

  return reachable.length > 0 ? reachable : listing.priceBreaks.slice(0, 1);
}

/** Index in `reachableBreaks` of the tier a quantity falls in. */
export function tierIndexFor(listing: Listing, kg: number): number {
  const tiers = reachableBreaks(listing);
  const found = tiers.reduce(
    (best, tier, at) => (kg * 1000 >= toGrams(tier.fromKg) ? at : best),
    0
  );

  return Math.max(found, 0);
}

/** The rate for a quantity: the highest tier whose minimum is reached. */
export function rateFor(listing: Listing, kg: number): string {
  return reachableBreaks(listing)[tierIndexFor(listing, kg)].pricePerKg;
}

/** The lowest price a buyer can reach, for "From R x.xx / kg". */
export function lowestRate(listing: Listing): string {
  const tiers = reachableBreaks(listing);

  return tiers[tiers.length - 1].pricePerKg;
}
