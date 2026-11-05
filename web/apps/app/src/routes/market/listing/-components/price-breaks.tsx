import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { reachableBreaks } from '@/lib/data/listings';
import { formatKgNumber, formatRate, toGrams } from '@/lib/format';
import type { Listing } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * "50–999.99 kg", "1 000–4 999.99 kg", "5 000+ kg". Each range ends one
 * hundredth of a kg before the next starts, so no weight falls in a gap.
 */
function rangeLabel(listing: Listing, index: number): string {
  const tiers = reachableBreaks(listing);
  const next = tiers[index + 1];
  // The first tier starts at the smallest order, not at zero.
  const start = index === 0 ? listing.minKg : tiers[index].fromKg;

  if (!next) return `${formatKgNumber(start)}+ kg`;

  const end = (toGrams(next.fromKg) - 10) / 1000;

  return `${formatKgNumber(start)}–${formatKgNumber(end)} kg`;
}

type Props = { listing: Listing; activeIndex: number };

/** Bulk pricing (design 04). The row for the chosen quantity is highlighted. */
export function PriceBreaks({ listing, activeIndex }: Props) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Quantity</TableHead>
          <TableHead className="text-right">Price</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {reachableBreaks(listing).map((tier, index) => (
          <TableRow
            key={tier.fromKg}
            aria-current={index === activeIndex ? 'true' : undefined}
            className={cn(index === activeIndex && 'bg-primary/15 font-medium')}
          >
            <TableCell>{rangeLabel(listing, index)}</TableCell>
            <TableCell className="text-right tabular-nums">
              {formatRate(tier.pricePerKg)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
