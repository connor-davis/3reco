import type { RequestStatus } from '@/lib/api/types';

type Variant = 'mint' | 'butter' | 'peach' | 'sky' | 'rose';

/** One tint map for request codes, status labels and viewer-specific waiting tags. */
export function statusTint(status: string): Variant {
  const label = status.toLowerCase();
  if (/waiting for you|waiting on you|your turn|offer received/.test(label))
    return 'peach';
  if (/^(paid|settled|completed?|accepted|invoiced)$/.test(label))
    return 'mint';
  if (/^(rejected|cancelled|declined|incomplete|low|error)$/.test(label))
    return 'rose';
  if (/pending|requested|counter|offer|waiting/.test(label)) return 'butter';
  return 'sky';
}

/** The word and colour for each request status; badges and filters share it. */
export const requestStatuses = {
  pending: { label: 'Pending', variant: statusTint('pending') },
  offered: {
    label: 'Offer awaiting confirmation',
    variant: statusTint('offered'),
  },
  accepted: { label: 'Complete', variant: statusTint('accepted') },
  rejected: { label: 'Rejected', variant: statusTint('rejected') },
  cancelled: { label: 'Cancelled', variant: statusTint('cancelled') },
} satisfies Record<RequestStatus, { label: string; variant: Variant }>;
