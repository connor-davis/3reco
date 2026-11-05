import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { MessageSquare, SquarePen } from 'lucide-react';
import { StatusBadge } from '@/components/badges';
import { DataState, RowsSkeleton } from '@/components/data-state';
import { ChipGroup, SearchBox } from '@/components/filters';
import { IconButton } from '@/components/icon-button';
import { PersonAvatar } from '@/components/visuals';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useThreadHistory } from '@/lib/api/messages';
import { formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';

export function Inbox({
  activeId,
  onNew,
}: {
  activeId?: string;
  onNew: () => void;
}) {
  const query = useThreadHistory();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const threads = [
    ...new Map(
      (query.data?.pages.flatMap((page) => page.items) ?? []).map((thread) => [
        thread.request_id,
        thread,
      ])
    ).values(),
  ].sort((a, b) => b.activity_at.localeCompare(a.activity_at));
  const shown = threads.filter(
    (thread) =>
      (filter !== 'unread' || thread.unread_count > 0) &&
      (filter !== 'offers' || thread.status === 'offered') &&
      thread.other.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-full flex-col gap-4 px-5 pt-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Messages</h1>
        <IconButton
          label="Start a new conversation"
          variant="outline"
          onClick={onNew}
        >
          <SquarePen />
        </IconButton>
      </div>
      <SearchBox
        label="Search loaded conversations"
        value={search}
        onChange={setSearch}
        className="sm:max-w-none"
      />
      <ChipGroup
        outlined
        label="Filter loaded conversations"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'All' },
          { value: 'unread', label: 'Unread' },
          { value: 'offers', label: 'Offers' },
        ]}
      />
      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        <DataState
          query={query}
          isEmpty={!shown.length}
          icon={MessageSquare}
          emptyTitle={
            threads.length
              ? 'No matching conversations'
              : 'No conversations yet'
          }
          emptyText="Ask a seller about a listing to start one."
          skeleton={<RowsSkeleton rows={6} />}
        >
          <ul className="-mx-3 space-y-1 px-2">
            {shown.map((thread) => (
              <li key={thread.request_id}>
                <Link
                  to="/messages/$requestId"
                  params={{ requestId: thread.request_id }}
                  aria-current={
                    activeId === thread.request_id ? 'page' : undefined
                  }
                  className={cn(
                    'flex min-h-28 items-start gap-3 rounded-xl p-4 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50',
                    activeId === thread.request_id && 'bg-accent'
                  )}
                >
                  <PersonAvatar name={thread.other.name} />
                  <span className="min-w-0 flex-1">
                    <span className="flex justify-between gap-2">
                      <span className="truncate font-medium">
                        {thread.other.name}
                      </span>
                      <time
                        dateTime={thread.activity_at}
                        className="text-xs text-muted-foreground"
                      >
                        {formatTime(thread.activity_at)}
                      </time>
                    </span>
                    <span className="block truncate text-sm text-muted-foreground">
                      {thread.latest_message?.content ?? 'New request'}
                    </span>
                    <StatusBadge status={thread.status} />
                  </span>
                  {thread.unread_count > 0 && (
                    <Badge aria-label={`${thread.unread_count} unread`}>
                      {thread.unread_count}
                    </Badge>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </DataState>
        {query.hasNextPage && (
          <Button
            className="mt-4 w-full"
            variant="outline"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            More conversations
          </Button>
        )}
      </div>
      <p className="-mx-5 border-t px-5 py-4 text-center text-xs text-muted-foreground">
        Your conversations stay private.
      </p>
    </div>
  );
}
