import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { MessageSquare, SquarePen } from 'lucide-react';
import { StatusBadge } from '@/components/badges';
import { DataState, RowsSkeleton } from '@/components/data-state';
import { ChipGroup, SearchBox } from '@/components/filters';
import { IconButton } from '@/components/icon-button';
import { PersonAvatar } from '@/components/visuals';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { MarketRequest } from '@/lib/types';
import { counterpartyOf } from './helpers';

type Props = {
  requests: MarketRequest[];
  activeId?: string;
  onNew: () => void;
};

/** Left column of the messages screen: search, filter chips and thread rows. */
export function Inbox({ requests, activeId, onNew }: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');

  const unread = requests.filter((request) => request.unread > 0).length;
  const offers = requests.filter((request) => request.offerPending).length;

  const shown = requests.filter((request) => {
    if (filter === 'unread' && request.unread === 0) return false;
    if (filter === 'offers' && !request.offerPending) return false;

    return counterpartyOf(request)
      .name.toLowerCase()
      .includes(query.toLowerCase());
  });

  return (
    <div className="flex h-full flex-col gap-4 px-5 pt-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
        <IconButton
          label="Start a new conversation"
          variant="outline"
          onClick={onNew}
        >
          <SquarePen />
        </IconButton>
      </div>
      <SearchBox
        label="Search conversations"
        value={query}
        onChange={setQuery}
        className="sm:max-w-none"
      />
      <ChipGroup
        outlined
        label="Filter conversations"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'All' },
          { value: 'unread', label: `Unread · ${unread}` },
          { value: 'offers', label: `Offers · ${offers}` },
        ]}
      />
      <DataState
        isEmpty={shown.length === 0}
        icon={MessageSquare}
        emptyTitle="No conversations yet"
        emptyText="Ask a seller about a listing to start one."
        skeleton={<RowsSkeleton rows={6} />}
      >
        <ul className="-mx-3 flex-1 space-y-1 overflow-y-auto px-2 pb-2">
          {shown.map((request) => (
            <ThreadRow
              key={request.id}
              request={request}
              active={request.id === activeId}
            />
          ))}
        </ul>
      </DataState>
      <p className="-mx-5 border-t px-5 py-4 text-center text-xs text-muted-foreground">
        Your conversations stay private.
      </p>
    </div>
  );
}

function ThreadRow({
  request,
  active,
}: {
  request: MarketRequest;
  active: boolean;
}) {
  const other = counterpartyOf(request);

  return (
    <li>
      <Link
        to="/messages/$requestId"
        params={{ requestId: request.id }}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex min-h-28 items-start gap-3 rounded-xl p-4 outline-none',
          'hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50',
          active && 'bg-accent'
        )}
      >
        <PersonAvatar name={other.name} online={other.online} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className="truncate font-medium">{other.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {request.lastAt}
            </span>
          </span>
          <span className="block truncate text-sm text-muted-foreground">
            {request.preview}
          </span>
          <StatusBadge status={request.status} />
        </span>
        {request.unread > 0 && (
          <Badge aria-label={`${request.unread} unread`}>
            {request.unread}
          </Badge>
        )}
      </Link>
    </li>
  );
}
