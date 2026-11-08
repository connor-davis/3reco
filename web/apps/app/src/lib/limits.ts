// Compare hundredths exactly, without rounding the typed amount.
export function stockLimit(value: string, maximum: bigint, message: string) {
  const clean = value.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return undefined;

  const hundredths = (raw: string) => {
    const [whole, fraction = ''] = raw.trim().replace(',', '.').split('.');
    return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  };
  const amount = hundredths(clean);
  return amount > maximum ? message : undefined;
}
