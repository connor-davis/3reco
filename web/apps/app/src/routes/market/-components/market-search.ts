/** Distance choices in km. The server accepts only these. */
export const DISTANCES = [10, 25, 50, 100] as const;

/** Every market filter lives in the URL query, so a link shares the exact view. */
export interface MarketSearch {
  q?: string;
  material_id?: string;
  min_price?: string;
  max_price?: string;
  max_km?: number;
  cursor?: string;
}

// An exact rand amount: digits and up to four decimals, never a float.
const PRICE = /^\d{1,9}(\.\d{1,4})?$/;

const text = (value: unknown) =>
  typeof value === 'string' && value ? value : undefined;

/** Reads the URL query. Anything odd is dropped, so a bad link still opens. */
export function parseMarketSearch(raw: Record<string, unknown>): MarketSearch {
  const price = (value: unknown) => {
    const found = text(value);
    return found && PRICE.test(found) ? found : undefined;
  };
  const km = Number(raw.max_km);
  const parsed: MarketSearch = {
    q: text(raw.q),
    material_id: text(raw.material_id),
    min_price: price(raw.min_price),
    max_price: price(raw.max_price),
    max_km: (DISTANCES as readonly number[]).includes(km) ? km : undefined,
    cursor: text(raw.cursor),
  };
  // Leave unset keys out so the URL stays short.
  return Object.fromEntries(
    Object.entries(parsed).filter(([, value]) => value !== undefined)
  ) as MarketSearch;
}

/** How many filters beyond the search text are set; the Filters button shows it. */
export function activeFilterCount(search: MarketSearch) {
  return [
    search.material_id,
    search.min_price,
    search.max_price,
    search.max_km,
  ].filter((value) => value !== undefined).length;
}

/** A change to a filter starts again from the first page. */
export function changeFilter(
  current: MarketSearch,
  change: Partial<MarketSearch>
): MarketSearch {
  return parseMarketSearch({ ...current, ...change, cursor: undefined });
}

/** True while a typed price is a whole, valid amount (or empty). */
export function validPrice(value: string) {
  return value === '' || PRICE.test(value);
}

/** The message for a price range the server would refuse, or nothing. */
export function priceRangeError(min = '', max = '') {
  if (!validPrice(min) || !validPrice(max)) return 'Enter a price like 12.50.';
  if (!min || !max) return '';
  // Compare as scaled integers so no float is involved.
  const scaled = (value: string) => {
    const [whole, cents = ''] = value.split('.');
    return BigInt(whole + cents.padEnd(4, '0'));
  };
  return scaled(min) > scaled(max)
    ? 'The lowest price is above the highest.'
    : '';
}
