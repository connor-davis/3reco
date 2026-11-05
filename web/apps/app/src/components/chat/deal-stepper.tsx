import type { RequestStatus } from '@/lib/api/types';
import { StatusBadge } from '@/components/badges';
import { cn } from '@/lib/utils';

export function DealStepper({ status }: { status: RequestStatus }) {
  if (status === 'rejected' || status === 'cancelled')
    return <StatusBadge status={status} />;
  const steps = ['pending', 'offered', 'accepted'] as const;
  const current = steps.indexOf(status);
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
