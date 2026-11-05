import { currentMaterials } from '@/lib/data/materials';
import { stores } from '@/lib/data/stores';
import { toGrams } from '@/lib/format';
import type { RequestLine, Store, Transaction } from '@/lib/types';

// Factors are kg CO2e saved per kg of material diverted (design 09). They
// are illustrative. Every page goes through the helpers below, so no page
// hard-codes a factor.

/** The fixed community numbers the mock starts with (no timers). */
export const community = {
  kgDiverted: 4_318_250,
  co2Kg: 7_064_100,
  deals: 8_421,
};

type Lines = Pick<RequestLine, 'materialId' | 'kg'>[];

/** CO2e in kg for a set of material lines. */
export function co2For(lines: Lines): number {
  return lines.reduce((sum, line) => {
    const material = currentMaterials().find((m) => m.id === line.materialId);
    const factor = toGrams(material?.carbonFactor ?? '0');

    return sum + (toGrams(line.kg) * factor) / 1_000_000;
  }, 0);
}

/** Total kg for a set of lines. */
export function kgFor(lines: Pick<RequestLine, 'kg'>[]): number {
  return lines.reduce((sum, line) => sum + toGrams(line.kg) / 1000, 0);
}

/** CO2e written as "729 kg CO₂e" or "7.1 t CO₂e". */
export function formatCo2(kg: number): string {
  if (kg < 1000) return `${Math.round(kg)} kg CO₂e`;
  return `${(kg / 1000).toFixed(1)} t CO₂e`;
}

/** Everyday equivalents of a CO2e number (design 09). */
export function equivalents(co2Kg: number) {
  return {
    trees: Math.round(co2Kg / 21),
    kmDriven: Math.round(co2Kg / 0.17),
  };
}

/**
 * Stores ranked by the CO2e of the material they moved. A business-to-business
 * sale counts for the seller; a collector purchase counts for the buying store.
 */
export function topStoresByImpact(rows: Transaction[], limit = 5) {
  const totals = new Map<string, { store: Store; kg: number; co2Kg: number }>();

  for (const row of rows) {
    const name = row.type === 'B2B' ? row.seller : row.buyer;
    const store = stores.find((item) => item.name === name);

    if (!store) continue;

    const entry = totals.get(store.id) ?? { store, kg: 0, co2Kg: 0 };
    entry.kg += kgFor([row]);
    entry.co2Kg += co2For([row]);
    totals.set(store.id, entry);
  }

  return [...totals.values()].sort((a, b) => b.co2Kg - a.co2Kg).slice(0, limit);
}
