import type { RequestStatus } from '@/lib/api/types';

type Variant = 'default' | 'secondary' | 'outline' | 'destructive';

/** The word and colour for each request status; badges and filters share it. */
export const requestStatuses = {
  pending: { label: 'Pending', variant: 'secondary' },
  offered: { label: 'Offer awaiting confirmation', variant: 'secondary' },
  accepted: { label: 'Complete', variant: 'default' },
  rejected: { label: 'Rejected', variant: 'destructive' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
} satisfies Record<RequestStatus, { label: string; variant: Variant }>;
