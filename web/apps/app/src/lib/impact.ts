import { useStats } from '@/lib/api/stats';
import { formatKgFixed, toGrams } from '@/lib/format';

// Factors are kg CO2e saved per kg of material diverted (design 09). They
// are illustrative. Every page goes through the helpers below, so no page
// hard-codes a factor.

/** Community totals from the public stats route (kg and CO2e as numbers). */
export function useCommunity() {
  const query = useStats();
  const stats = query.data;

  return {
    query,
    kgDiverted: stats ? toGrams(stats.total_kg) / 1000 : 0,
    co2Kg: stats ? toGrams(stats.co2_kg) / 1000 : 0,
    deals: stats?.deals ?? 0,
    topStores: stats?.top_stores ?? [],
  };
}

/** CO2e in kg for a weight and a material's carbon factor (both exact text). */
export function co2OfWeight(weight: string, carbonFactor: string): number {
  return (toGrams(weight) * toGrams(carbonFactor)) / 1_000_000;
}

/** CO2e written like a weight: "729.40 kg CO₂e", "3 580.11 kg CO₂e". */
export function formatCo2(value: number | string): string {
  const kg = typeof value === 'string' ? toGrams(value) / 1000 : value;
  return `${formatKgFixed(kg)} kg CO₂e`;
}
