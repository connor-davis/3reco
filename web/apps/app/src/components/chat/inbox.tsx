import { useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { LoaderCircle, MessageSquare, SquarePen } from 'lucide-react';
import { StatusBadge } from '@/components/badges';
import { DataState, RowsSkeleton } from '@/components/data-state';
import { ChipGroup, SearchBox } from '@/components/filters';
import { IconButton } from '@/components/icon-button';
import { PersonAvatar } from '@/components/visuals';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useThreadHistory } from '@/lib/api/messages';
import { useAuth } from '@/lib/auth/use-auth';
import { formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { messageText, threadSummary } from './helpers';

export function Inbox({
  activeId,
  onNew,
}: {
  activeId?: string;
  onNew: () => void;
}) {
  const { user } = useAuth();
  const admin = user?.role === 'admin';
  // Staff read the platform but never take part in a trade chat.
  const staff = user?.role === 'staff';
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const query = useThreadHistory(debouncedSearch, filter);
  const scroll = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetching, isFetchNextPageError, fetchNextPage } =
    query;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    scroll.current?.scrollTo({ top: 0 });
  }, [debouncedSearch, filter]);

  useEffect(() => {
    if (
      !hasNextPage ||
      isFetching ||
      isFetchNextPageError ||
      !sentinel.current ||
      typeof IntersectionObserver === 'undefined'
    )
      return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void fetchNextPage();
      },
      { root: scroll.current, rootMargin: '0px 0px 160px 0px' }
    );
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetching, isFetchNextPageError, fetchNextPage]);

  // ponytail: no virtualisation dependency is installed. Rows grow only as
  // people scroll; add windowing if long browsing sessions become expensive.
  const threads = [
    ...new Map(
      (query.data?.pages.flatMap((page) => page.items) ?? []).map((thread) => [
        thread.request_id,
        thread,
      ])
    ).values(),
  ].sort((a, b) => b.activity_at.localeCompare(a.activity_at));

  return (
    <div className="flex h-full min-w-0 flex-col gap-4 px-5 pt-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Messages</h1>
        {!admin && !staff && (
          <IconButton
            label="Start a new conversation"
            variant="outline"
            onClick={onNew}
          >
            <SquarePen />
          </IconButton>
        )}
      </div>
      <SearchBox
        label="Search conversations"
        value={search}
        onChange={setSearch}
        className="sm:max-w-none"
      />
      <ChipGroup
        outlined
        label="Filter conversations"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'All' },
          ...(!admin ? [{ value: 'unread', label: 'Unread' }] : []),
          { value: 'offers', label: 'Offers' },
          { value: 'done', label: 'Finished' },
        ]}
      />
      <div
        ref={scroll}
        className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto pb-4"
      >
        <DataState
          query={{ ...query, isError: query.isLoadingError }}
          isEmpty={!threads.length}
          icon={MessageSquare}
          emptyTitle={
            debouncedSearch || filter !== 'all'
              ? 'No matching conversations'
              : 'No conversations yet'
          }
          emptyText={
            debouncedSearch || filter !== 'all'
              ? 'Try another word or filter.'
              : admin
                ? 'No conversations on 3REco yet.'
                : staff
                  ? 'Staff do not take part in trade chats.'
                  : 'Ask a seller about a listing to start one.'
          }
          skeleton={<RowsSkeleton rows={6} />}
        >
          <ul className="min-w-0 space-y-1 px-1">
            {threads.map((thread) => (
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
                      <span
                        className={cn(
                          'min-w-0 font-medium',
                          admin ? 'break-words' : 'truncate'
                        )}
                      >
                        {thread.other.name}
                      </span>
                      <time
                        dateTime={thread.activity_at}
                        className="shrink-0 text-xs text-muted-foreground"
                      >
                        {formatTime(thread.activity_at)}
                      </time>
                    </span>
                    <span className="block truncate text-sm text-muted-foreground">
                      {thread.latest_message?.system && 'System · '}
                      {messageText(
                        thread.latest_message?.content ?? 'New request'
                      )}
                    </span>
                    <StatusBadge status={thread.status} />
                    <span className="block text-xs text-muted-foreground">
                      {threadSummary(thread)}
                    </span>
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
        <div ref={sentinel} />
        {query.isFetchingNextPage && (
          <p
            role="status"
            className="flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground"
          >
            <LoaderCircle className="size-4 animate-spin" /> Loading
            conversations…
          </p>
        )}
        {query.isFetchNextPageError && (
          <p role="alert">Could not load more conversations. Try again.</p>
        )}
        {query.hasNextPage && (
          <Button
            className="mt-4 w-full"
            variant="outline"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            Load more
          </Button>
        )}
        {query.isSuccess &&
          !query.hasNextPage &&
          threads.length > 0 &&
          !threads.some((thread) => thread.unread_count > 0) && (
            <p className="py-4 text-center text-xs text-muted-foreground">
              End of list.
            </p>
          )}
      </div>
      <p className="-mx-5 border-t px-5 py-4 text-center text-xs text-muted-foreground">
        {admin
          ? "You can read every chat. You can't send messages in chats you're not part of."
          : 'Only you, the other side and 3REco admins can read these chats.'}
      </p>
    </div>
  );
}
