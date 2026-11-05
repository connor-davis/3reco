import { BadgeCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

type BadgeVariant = 'default' | 'secondary' | 'outline' | 'destructive';

const statusVariant: Record<string, BadgeVariant> = {
  Paid: 'default',
  Completed: 'default',
  Accepted: 'default',
  Invoiced: 'default',
  Pending: 'secondary',
  Requested: 'secondary',
  'Offer sent': 'secondary',
  Counter: 'secondary',
  Rejected: 'destructive',
  Cancelled: 'destructive',
  Incomplete: 'outline',
  Complete: 'default',
};

const dotColour: Record<BadgeVariant, string> = {
  default: 'bg-primary',
  secondary: 'bg-muted-foreground',
  outline: 'bg-muted-foreground',
  destructive: 'bg-destructive',
};

/** One dot and word for every deal, payment and profile status (design 05). */
export function StatusBadge({ status }: { status: string }) {
  const variant = statusVariant[status] ?? 'outline';

  return (
    <Badge
      variant={variant === 'destructive' ? 'destructive' : 'outline'}
      className="gap-2 border-transparent bg-transparent px-0 dark:bg-transparent"
    >
      <span
        className={cn('size-2 rounded-full', dotColour[variant])}
        aria-hidden="true"
      />
      {status}
    </Badge>
  );
}

/** Verified supplier badge. Click, tap or press Enter to read what was checked. */
export function VerifiedBadge({ verified }: { verified: boolean }) {
  if (!verified) return <Badge variant="outline">Supplier</Badge>;

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          'relative z-10 rounded-full outline-none',
          'max-[780px]:inline-flex max-[780px]:min-h-11 max-[780px]:items-center',
          'focus-visible:ring-3 focus-visible:ring-ring/50'
        )}
      >
        <Badge variant="secondary">
          <BadgeCheck data-icon="inline-start" />
          Verified supplier
        </Badge>
      </PopoverTrigger>
      <PopoverContent className="w-64 text-sm">
        Business identity and trading details reviewed.
      </PopoverContent>
    </Popover>
  );
}
