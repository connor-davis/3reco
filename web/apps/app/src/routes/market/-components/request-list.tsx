import { useState } from 'react';
import { Inbox } from 'lucide-react';
import { StatusBadge } from '@/components/badges';
import {
  counterpartyOf,
  isClosed,
  requestTotal,
} from '@/components/chat/helpers';
import { DataState, RowsSkeleton } from '@/components/data-state';
import { ChoiceSelect, SearchBox } from '@/components/filters';
import { Link } from '@tanstack/react-router';
import { LinkButton } from '@/components/link-button';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { PersonAvatar } from '@/components/visuals';
import { useRequests } from '@/lib/api/requests';
import { useAuth } from '@/lib/auth/use-auth';
import { requestStatuses } from '@/lib/request-status';
import type { RequestStatus, TradeRequest } from '@/lib/api/types';
import { formatDate, formatKg, formatRand, formatRate } from '@/lib/format';

export function RequestList({
  direction,
  title,
  description,
  emptyTitle,
}: {
  direction: 'incoming' | 'outgoing';
  title: string;
  description: string;
  emptyTitle: string;
}) {
  const { user } = useAuth();
  const [cursor, setCursor] = useState<string>();
  const query = useRequests(direction, { cursor });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const requests = query.data?.items ?? [];
  const shown = requests.filter(
    (request) =>
      (status === 'all' || request.status === status) &&
      `${counterpartyOf(request, user?.id).name} ${request.items.map((item) => item.material_name).join(' ')} ${request.id}`
        .toLowerCase()
        .includes(search.toLowerCase())
  );

  return (
    <>
      <PageHeader
        title={title}
        description={description}
        actions={<LinkButton to="/messages">Open messages</LinkButton>}
      />
      <div className="mb-6 flex flex-wrap gap-3">
        <SearchBox
          label="Search this page"
          value={search}
          onChange={setSearch}
        />
        <ChoiceSelect
          label="Status on this page"
          value={status}
          onChange={setStatus}
          options={[
            'all',
            'pending',
            'offered',
            'accepted',
            'rejected',
            'cancelled',
          ].map((value) => ({
            value,
            label:
              value === 'all'
                ? 'All statuses'
                : (requestStatuses[value as RequestStatus]?.label ?? value),
          }))}
        />
      </div>
      <DataState
        query={query}
        isEmpty={!shown.length}
        icon={Inbox}
        emptyTitle={requests.length ? 'No matching requests' : emptyTitle}
        emptyText="Requests appear here when you start trading."
        skeleton={<RowsSkeleton />}
      >
        <ul className="divide-y rounded-2xl border">
          {shown.map((request) => {
            const other = counterpartyOf(request, user?.id);
            return (
              <li key={request.id}>
                <Link
                  to="/market/$requestId"
                  params={{ requestId: request.id }}
                  className="flex flex-wrap items-center gap-4 rounded-xl p-4 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <PersonAvatar name={other.name} />
                  <div className="min-w-40 flex-1">
                    <p className="font-medium">{other.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {request.items
                        .map((item) => item.material_name)
                        .join(', ')}{' '}
                      · {formatDate(request.created_at)}
                    </p>
                    {direction === 'incoming' && <Terms request={request} />}
                  </div>
                  <StatusBadge status={request.status} />
                  <p className="tabular-nums">
                    {request.items.some((item) => item.offer_price !== null)
                      ? formatRand(requestTotal(request))
                      : isClosed(request)
                        ? 'Closed'
                        : 'Awaiting offer'}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      </DataState>
      <div className="my-6 flex gap-3">
        {cursor && (
          <Button variant="outline" onClick={() => setCursor(undefined)}>
            First page
          </Button>
        )}
        {query.data?.has_more && (
          <Button
            variant="outline"
            onClick={() => setCursor(query.data?.next_cursor ?? undefined)}
          >
            Next page
          </Button>
        )}
      </div>
    </>
  );
}

// What was asked for, from the offer when there is one: "200 kg at R 23.40 / kg".
function Terms({ request }: { request: TradeRequest }) {
  const lines = request.items.flatMap((item) => {
    const weight = item.offer_weight ?? item.requested_weight;
    const price = item.offer_price ?? item.requested_price;

    return weight && price
      ? [`${formatKg(weight)} at ${formatRate(price)}`]
      : [];
  });

  if (!lines.length) return null;

  return <p className="text-sm text-muted-foreground">{lines.join(' · ')}</p>;
}
