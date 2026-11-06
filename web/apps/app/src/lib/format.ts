// Money is integer cents and weight is a decimal string. Nothing here uses
// floating point for money, so totals never drift (AGENTS.md).

/** Turns "4.60" into 460 (cents). Extra digits are rounded half up. */
export function toCents(price: string): number {
  return Number(exactScaled(price, 2, true) ?? 0n);
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

// Decimal text to a scaled BigInt (2 places = cents), or null when it is not a
// plain decimal. Digits past `places` are cut, or rounded half up when asked.
function exactScaled(
  value: string,
  places: number,
  round = false
): bigint | null {
  const clean = value.trim().replace(',', '.');
  if (!/^\d*\.?\d*$/.test(clean)) return null;

  const [whole = '', fraction = ''] = clean.split('.');
  const kept = BigInt(
    (whole || '0') + fraction.padEnd(places, '0').slice(0, places)
  );
  const next = fraction.charAt(places);

  return round && next >= '5' ? kept + 1n : kept;
}

/** Line total in cents: price per kg times weight, rounded half up to the cent. */
export function lineCents(pricePerKg: string, kg: string): number {
  const price = exactScaled(pricePerKg, 6) ?? 0n;
  const weight = exactScaled(kg, 6) ?? 0n;

  return Number(
    (price * weight * 100n + 500_000_000_000n) / 1_000_000_000_000n
  );
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

/** "1 trade", "2 trades", "0 trades". Pass the plural when it is not just +s. */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Today's date as "2026-11-06" in South African time, not UTC. */
export function today(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg',
  }).format(new Date());
}
