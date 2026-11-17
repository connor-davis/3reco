import type { TradeRequest } from '@/lib/api/types';
import { StatusBadge } from '@/components/badges';

// One line, plain words: which of the four steps the deal is on.
const steps = [
  'waiting for an offer',
  'offer on the table',
  'waiting for confirmations',
  'complete',
];

export function DealStepper({ request }: { request: TradeRequest }) {
  const status = request.status;
  if (status === 'rejected' || status === 'cancelled')
    return <StatusBadge status={status} />;
  const confirming =
    request.buyer_confirmed_version === request.offer_version ||
    request.seller_confirmed_version === request.offer_version;
  const current =
    status === 'accepted' ? 3 : confirming ? 2 : status === 'offered' ? 1 : 0;
  return (
    <p className="text-sm text-muted-foreground">
      Step {current + 1} of {steps.length}: {steps[current]}
    </p>
  );
}
