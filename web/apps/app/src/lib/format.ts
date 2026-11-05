// Money is integer cents and weight is a decimal string. Nothing here uses
// floating point for money, so totals never drift (AGENTS.md).

/** Turns "4.60" into 460 (cents). Extra digits are cut, not rounded. */
export function toCents(price: string): number {
  return toUnits(price, 2);
}

/** Turns "1250.5" into 1250500 (grams). */
export function toGrams(kg: string): number {
  return toUnits(kg, 3);
}

function toUnits(value: string, decimals: number): number {
  const clean = value.trim().replace(',', '.');
  if (!/^\d*\.?\d*$/.test(clean)) return 0;

  const [whole = '0', fraction = ''] = clean.split('.');
  const padded = fraction.padEnd(decimals, '0').slice(0, decimals);
  const wholeUnits = parseInt(whole || '0', 10) * 10 ** decimals;

  return wholeUnits + parseInt(padded || '0', 10);
}

/** Line total in cents: price per kg times weight, rounded to the cent. */
export function lineCents(pricePerKg: string, kg: string): number {
  return Math.round((toCents(pricePerKg) * toGrams(kg)) / 1000);
}

function spaced(whole: number): string {
  return whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Prints a weight with thousands spaces and no unit: "12 000", "999.99". */
export function formatKgNumber(kg: string | number): string {
  const grams = typeof kg === 'number' ? Math.round(kg * 1000) : toGrams(kg);
  const whole = spaced(Math.floor(grams / 1000));
  const rest = grams % 1000;

  if (rest === 0) return whole;

  return `${whole}.${rest.toString().padStart(3, '0').replace(/0+$/, '')}`;
}

/** Prints cents as "R 3 020.00" with a space for thousands. */
export function formatRand(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const rest = (abs % 100).toString().padStart(2, '0');

  return `${sign}R ${spaced(Math.floor(abs / 100))}.${rest}`;
}

/** Prints a rate such as "R 4.60 / kg". */
export function formatRate(pricePerKg: string): string {
  return `${formatRand(toCents(pricePerKg))} / kg`;
}

/** Prints a weight with thousands spaces: "12 000 kg". */
export function formatKg(kg: string | number): string {
  return `${formatKgNumber(kg)} kg`;
}

/** Prints a mass in kg below 1 000 and tonnes from 1 000 up (09 rule). */
export function formatMass(kg: number): string {
  if (kg < 1000) return `${Math.round(kg)} kg`;
  return `${(kg / 1000).toFixed(1)} t`;
}

const dateFormat = new Intl.DateTimeFormat('en-ZA', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** Prints "2026-11-05" as "5 Nov 2026". */
export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

/** Prints an ISO time as "10:42" in South African time. */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-ZA', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Africa/Johannesburg',
  });
}

/** Two letters for an avatar fallback. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('');
}
