import { useState } from 'react';
import { Inbox } from 'lucide-react';
import { StatusBadge } from '@/components/badges';
import { counterpartyOf, requestTotal } from '@/components/chat/helpers';
import { DataState, RowsSkeleton } from '@/components/data-state';
import { ChoiceSelect, SearchBox } from '@/components/filters';
import { LinkButton } from '@/components/link-button';
import { PageHeader } from '@/components/page-header';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item';
import { PersonAvatar } from '@/components/visuals';
import { materialById } from '@/lib/data/materials';
import { myStoreId } from '@/lib/data/stores';
import { formatDate, formatRand } from '@/lib/format';
import { useMock } from '@/lib/mock/hooks';

type Props = {
  direction: 'incoming' | 'outgoing';
  title: string;
  description: string;
  emptyTitle: string;
};

const statusOptions = [
  { value: 'all', label: 'All statuses' },
  { value: 'Requested', label: 'Requested' },
  { value: 'Offer sent', label: 'Offer received' },
  { value: 'Counter', label: 'In discussion' },
  { value: 'Accepted', label: 'Accepted' },
  { value: 'Completed', label: 'Completed' },
];

/** Incoming and outgoing requests share this list. Only the filter differs. */
export function RequestList({
  direction,
  title,
  description,
  emptyTitle,
}: Props) {
  const { data } = useMock();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');

  const mine = data.requests.filter((request) =>
    direction === 'incoming'
      ? request.sellerId === myStoreId
      : request.buyerId === myStoreId
  );
  const shown = mine.filter((request) => {
    if (status !== 'all' && request.status !== status) return false;

    const name = counterpartyOf(request).name;
    const material = materialById(request.items[0].materialId).name;

    return `${name} ${material} ${request.id}`
      .toLowerCase()
      .includes(query.toLowerCase());
  });

  return (
    <>
      <PageHeader
        title={title}
        description={description}
        actions={<LinkButton to="/messages">Open messages</LinkButton>}
      />
      <div className="mb-6 flex flex-wrap gap-3">
        <SearchBox label="Search requests" value={query} onChange={setQuery} />
        <ChoiceSelect
          label="Status"
          value={status}
          options={statusOptions}
          onChange={setStatus}
        />
      </div>
      <DataState
        isEmpty={shown.length === 0}
        icon={Inbox}
        emptyTitle={mine.length === 0 ? emptyTitle : 'No matching requests'}
        emptyText={
          mine.length === 0
            ? 'They show up here as soon as they arrive.'
            : 'Try another search or status.'
        }
        skeleton={<RowsSkeleton />}
      >
        <ItemGroup className="rounded-2xl border">
          {shown.map((request) => {
            const other = counterpartyOf(request);

            return (
              <Item key={request.id}>
                <ItemMedia>
                  <PersonAvatar name={other.name} online={other.online} />
                </ItemMedia>
                <ItemContent className="min-w-40">
                  <ItemTitle>{other.name}</ItemTitle>
                  <ItemDescription>
                    {materialById(request.items[0].materialId).name}
                    {request.items.length > 1 &&
                      ` +${request.items.length - 1} more`}{' '}
                    · {formatDate(request.createdAt.slice(0, 10))} ·{' '}
                    {request.id}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <StatusBadge status={request.status} />
                  <span className="w-28 text-right font-medium tabular-nums">
                    {formatRand(requestTotal(request))}
                  </span>
                  <LinkButton
                    to="/market/$requestId"
                    params={{ requestId: request.id }}
                    variant="outline"
                  >
                    Open chat
                  </LinkButton>
                </ItemActions>
              </Item>
            );
          })}
        </ItemGroup>
      </DataState>
    </>
  );
}
