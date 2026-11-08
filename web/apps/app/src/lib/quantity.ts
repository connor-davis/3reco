import { formatKg, toGrams } from '@/lib/format';

export type StepOptions = {
  // Decimal places the field keeps (2 for kg and money, 6 for carbon factors).
  places: number;
  min?: string;
  max?: string;
};

/** What makes a decimal field a counter. Every amount field passes one. */
export type CounterProps = Partial<Omit<StepOptions, 'places'>> &
  Pick<StepOptions, 'places'> & {
    // The thing counted, for the button names: "weight" gives "Increase weight".
    noun: string;
    // Shown inside the field: "kg", "R / kg", or nothing.
    unit?: string;
    // Size of one press as a decimal string. Shift makes it ten times bigger.
    step: string;
  };

/** A weight in kg: 1 kg a press, typing keeps 2 decimals, `max` is the stock. */
export const weightCounter = (max?: string): CounterProps => ({
  noun: 'weight',
  unit: 'kg',
  step: '1',
  min: '0.01',
  max,
  places: 2,
});

/** A price in R per kg: R 1 a press, typing keeps cents, `min` is the base. */
export const priceCounter = (min = '0.01'): CounterProps => ({
  noun: 'price',
  unit: 'R / kg',
  step: '1',
  min,
  places: 2,
});

// Decimal string to a scaled integer. BigInt, because 12 digits plus 6 places
// is past what a float holds exactly. Null when the text is empty or not a
// plain decimal.
function scaled(value: string | undefined, places: number): bigint | null {
  const clean = (value ?? '').trim().replace(',', '.');

  if (!/\d/.test(clean) || !/^\d*\.?\d*$/.test(clean)) return null;

  const [whole = '', fraction = ''] = clean.split('.');

  return BigInt((whole || '0') + fraction.padEnd(places, '0').slice(0, places));
}

function plain(units: bigint, places: number): string {
  const digits = units.toString().padStart(places + 1, '0');
  const whole = digits.slice(0, digits.length - places);
  // Keep cents on money and kg ("5.00"), but trim a carbon factor's zeros.
  const fraction = digits
    .slice(digits.length - places)
    .replace(/0+$/, '')
    .padEnd(Math.min(places, 2), '0');

  return fraction ? `${whole}.${fraction}` : whole;
}

/** Moves a decimal string one step, exactly, and keeps it inside min and max. */
export function stepDecimal(
  value: string,
  step: string,
  direction: 1 | -1,
  { places, min, max }: StepOptions
): string {
  const current = scaled(value, places) ?? BigInt(0);
  const delta = scaled(step, places) ?? BigInt(0);
  let next = current + BigInt(direction) * delta;
  const low = scaled(min, places) ?? BigInt(0);
  const high = scaled(max, places);

  if (next < low) next = low;
  if (high !== null && next > high) next = high;

  return plain(next, places);
}

/** True when the value is already at the bound a step would run into. */
export function atBound(
  value: string,
  direction: 1 | -1,
  { places, min, max }: StepOptions
): boolean {
  const current = scaled(value, places) ?? BigInt(0);

  if (direction === -1) return current <= (scaled(min, places) ?? BigInt(0));

  const high = scaled(max, places);

  return high !== null && current >= high;
}

/**
 * Why a weight cannot be ordered, or null when it can. One owner for the
 * listing, cart and offer paths so they never disagree.
 */
export function quantityError(
  value: string,
  availableKg?: string
): string | null {
  const clean = value.trim().replace(',', '.');
  const isNumber = /^-?\d*\.?\d*$/.test(clean) && /\d/.test(clean);

  // The sign and zero come first, so "-5" is not told to use 2 decimals.
  if (clean.startsWith('-') || (isNumber && !/[1-9]/.test(clean))) {
    return 'Enter a weight above 0 kg.';
  }

  if (!isNumber) return 'Enter a weight as a number, like 12.5.';

  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return 'Use up to 2 decimals.';

  const grams = toGrams(clean);

  if (availableKg && grams > toGrams(availableKg)) {
    return `Only ${formatKg(availableKg)} is available.`;
  }

  return null;
}

/** Why a price per kg is not valid, or undefined when it is. Format only: caps live with the caller. */
export function priceError(raw: string): string | undefined {
  const price = raw.trim().replace(',', '.');
  if (!/^-?\d*\.?\d*$/.test(price) || !/\d/.test(price)) {
    return 'Enter a price as a number, like 22.80.';
  }
  if (/^\d{1,12}\.\d{3,}$/.test(price)) return 'Use up to 2 decimals.';
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(price) || !/[1-9]/.test(price)) {
    return 'Enter a price above R 0.00.';
  }
}
