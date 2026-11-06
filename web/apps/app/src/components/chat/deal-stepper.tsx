import type { TradeRequest } from '@/lib/api/types';
import { StatusBadge } from '@/components/badges';
import { cn } from '@/lib/utils';

export function DealStepper({ request }: { request: TradeRequest }) {
  const status = request.status;
  if (status === 'rejected' || status === 'cancelled')
    return <StatusBadge status={status} />;
  const steps = ['Requested', 'Offer', 'Confirmations', 'Complete'];
  const confirming =
    request.buyer_confirmed_version === request.offer_version ||
    request.seller_confirmed_version === request.offer_version;
  const current =
    status === 'accepted' ? 3 : confirming ? 2 : status === 'offered' ? 1 : 0;
  return (
    <ol aria-label="Deal progress" className="flex flex-wrap gap-2 text-xs">
      {steps.map((step, index) => (
        <li
          key={step}
          aria-current={index === current ? 'step' : undefined}
          className={cn(
            'rounded-full border px-3 py-2',
            index === current && 'border-primary bg-primary/15 font-medium',
            index > current && 'text-muted-foreground'
          )}
        >
          {step}
        </li>
      ))}
    </ol>
  );
}
