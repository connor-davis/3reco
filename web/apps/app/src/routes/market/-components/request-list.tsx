import { useState } from 'react';
import { Inbox } from 'lucide-react';
import { StatusBadge } from '@/components/badges';
import { counterpartyOf, requestTotal } from '@/components/chat/helpers';
import { DataState, RowsSkeleton } from '@/components/data-state';
import { ChoiceSelect, SearchBox } from '@/components/filters';
import { LinkButton } from '@/components/link-button';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { PersonAvatar } from '@/components/visuals';
import { useRequests } from '@/lib/api/requests';
import { useLiveTopics } from '@/lib/live/use-live';
import { useAuth } from '@/lib/auth/use-auth';
import { formatDate, formatRand } from '@/lib/format';

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
  useLiveTopics(
    requests.map((request) => `request:${request.id}`),
    [['requests', direction]]
  );
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
            label: value === 'all' ? 'All statuses' : value,
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
              <li
                key={request.id}
                className="flex flex-wrap items-center gap-4 p-4"
              >
                <PersonAvatar name={other.name} />
                <div className="min-w-40 flex-1">
                  <p className="font-medium">{other.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {request.items.map((item) => item.material_name).join(', ')}{' '}
                    · {formatDate(request.created_at)}
                  </p>
                </div>
                <StatusBadge status={request.status} />
                <p className="tabular-nums">
                  {request.items.some((item) => item.offer_price !== null)
                    ? formatRand(requestTotal(request))
                    : 'Awaiting offer'}
                </p>
                <LinkButton
                  to="/market/$requestId"
                  params={{ requestId: request.id }}
                  variant="outline"
                >
                  Open chat
                </LinkButton>
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
