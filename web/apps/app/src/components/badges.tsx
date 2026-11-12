import { BadgeCheck } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useAuth } from '@/lib/auth/use-auth';
import { cn } from '@/lib/utils';
import type { RequestStatus } from '@/lib/api/types';
import { requestStatuses } from '@/lib/request-status';
import { tradeTypeLabel, type TradeType } from '@/lib/trade-type';

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
  const requestStatus = Object.hasOwn(requestStatuses, status)
    ? requestStatuses[status as RequestStatus]
    : undefined;
  const variant = requestStatus?.variant ?? statusVariant[status] ?? 'outline';

  return (
    <Badge
      variant={variant === 'destructive' ? 'destructive' : 'outline'}
      className="gap-2 border-transparent bg-transparent px-0 dark:bg-transparent"
    >
      <span
        className={cn('size-2 rounded-full', dotColour[variant])}
        aria-hidden="true"
      />
      {requestStatus?.label ?? status}
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
          'max-lg:inline-flex max-lg:min-h-11 max-lg:items-center',
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

/** The small check shown beside a business 3REco has verified. */
export function VerifiedMark({ verified }: { verified?: boolean }) {
  return verified ? (
    <BadgeCheck
      role="img"
      aria-label="Verified business"
      className="ml-1 inline size-4 shrink-0 align-text-bottom text-primary"
    />
  ) : null;
}

/** A business or store name, with a small check when 3REco has verified it. */
export function BusinessName({
  name,
  verified,
}: {
  name: string;
  verified?: boolean;
}) {
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1 align-bottom">
      <span className="truncate">{name}</span>
      {verified && (
        <BadgeCheck
          role="img"
          aria-label="Verified business"
          className="size-4 shrink-0 text-primary"
        />
      )}
    </span>
  );
}

/** The trade type in plain words, with "Unverified" beside it when the business is not. */
export function TradeTypeLabel({
  type,
  verified,
}: {
  type: TradeType;
  verified?: boolean;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {tradeTypeLabel(type)}
      {verified === false && <Badge variant="outline">Unverified</Badge>}
    </span>
  );
}

/** Tells a business that 3REco has not verified it yet, so its store is hidden. */
export function UnverifiedBanner() {
  const { user } = useAuth();
  if (user?.role !== 'business' || user.business_verified) return null;

  return (
    <Alert role="status" className="mb-4">
      <AlertDescription>
        Your store is hidden from the market until 3REco verifies your business.
      </AlertDescription>
    </Alert>
  );
}
