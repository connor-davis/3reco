import { useStats } from '@/lib/api/stats';
import { toGrams } from '@/lib/format';

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

/** CO2e written as "729 kg CO₂e" or "7.1 t CO₂e". */
export function formatCo2(kg: number): string {
  if (kg < 1000) return `${Math.round(kg)} kg CO₂e`;
  return `${(kg / 1000).toFixed(1)} t CO₂e`;
}
