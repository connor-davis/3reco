import { useState } from 'react';
import { Inbox } from 'lucide-react';
import { StatusBadge } from '@/components/badges';
import {
  counterpartyOf,
  isClosed,
  requestTotal,
} from '@/components/chat/helpers';
import { DataState, RowsSkeleton } from '@/components/data-state';
import { FilterTabs } from '@/components/filters';
import { Toolbar } from '@/components/toolbar';
import { ListRow } from '@/components/list-row';
import { Link } from '@tanstack/react-router';
import { ButtonRow } from '@/components/button-row';
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
      <PageHeader title={title} description={description} />
      <div className="mb-6 space-y-4">
        <Toolbar label="Search this page" value={search} onChange={setSearch} />
        <FilterTabs
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
        <ul className="divide-y overflow-hidden rounded-lg border">
          {shown.map((request) => {
            const other = counterpartyOf(request, user?.id);
            return (
              <li
                key={request.id}
                className="bg-[var(--row-background)] [--row-background:var(--background)] even:[--row-background:color-mix(in_oklab,var(--muted)_45%,var(--background))]"
              >
                <Link
                  to="/market/$requestId"
                  params={{ requestId: request.id }}
                  className="block outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <ListRow
                    media={<PersonAvatar name={other.name} />}
                    title={other.name}
                    subtitle={`${request.items.map((item) => item.material_name).join(', ')} · ${formatDate(request.created_at)}`}
                    meta={
                      direction === 'incoming' && <Terms request={request} />
                    }
                    status={<StatusBadge status={request.status} />}
                    value={
                      request.items.some((item) => item.offer_price !== null)
                        ? formatRand(requestTotal(request))
                        : isClosed(request)
                          ? 'Closed'
                          : 'Awaiting offer'
                    }
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      </DataState>
      <ButtonRow className="my-6">
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
      </ButtonRow>
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

  return <span>{lines.join(' · ')}</span>;
}
