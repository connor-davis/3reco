import { Check } from 'lucide-react';
import { dealSteps, stepOf } from '@/lib/data/requests';
import type { MarketRequest } from '@/lib/types';
import { cn } from '@/lib/utils';

/** Request, Offer, Counter, Accepted, Invoiced (design 04). */
export function DealStepper({ status }: { status: MarketRequest['status'] }) {
  const current = stepOf[status];

  return (
    <ol
      aria-label="Deal progress"
      className="flex flex-wrap items-center gap-2 text-xs"
    >
      {dealSteps.map((step, index) => {
        const done = index < current;
        const active = index === current;

        return (
          <li
            key={step}
            aria-current={active ? 'step' : undefined}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1',
              active && 'border-primary bg-primary/15 font-medium',
              !done && !active && 'text-muted-foreground max-[780px]:hidden'
            )}
          >
            {done && <Check className="size-3" aria-hidden="true" />}
            {step}
          </li>
        );
      })}
    </ol>
  );
}
