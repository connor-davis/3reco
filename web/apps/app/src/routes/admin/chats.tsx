import { createFileRoute, Link } from '@tanstack/react-router';
import { MessageSquare } from 'lucide-react';
import { Guarded } from '@/components/access-guard';
import { StatusBadge } from '@/components/badges';
import { DataState, RowsSkeleton } from '@/components/data-state';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { useAllThreads } from '@/lib/api/messages';
import { formatDate } from '@/lib/format';

export const Route = createFileRoute('/admin/chats')({
  component: () => (
    <Guarded page="chats">
      <AllConversations />
    </Guarded>
  ),
});

function AllConversations() {
  const query = useAllThreads();
  const threads = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <>
      <PageHeader
        title="All conversations"
        description="Every chat on 3REco, newest first. You can read them to settle disputes and keep the marketplace safe, but not write in them."
      />
      <DataState
        query={query}
        isEmpty={!threads.length}
        icon={MessageSquare}
        emptyTitle="No conversations yet"
        emptyText="Chats will appear here when people start talking."
        skeleton={<RowsSkeleton rows={6} />}
      >
        <ul className="grid gap-3">
          {threads.map((thread) => (
            <li key={thread.request_id}>
              <Link
                to="/messages/$requestId"
                params={{ requestId: thread.request_id }}
                className="block rounded-2xl border p-4 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {thread.buyer.name} buying from {thread.seller.name}
                  </span>
                  <StatusBadge status={thread.status} />
                </span>
                <span className="mt-1 block truncate text-sm text-muted-foreground">
                  {thread.latest_message?.content ?? 'No messages yet'}
                </span>
                <time
                  dateTime={thread.activity_at}
                  className="mt-1 block text-xs text-muted-foreground"
                >
                  {formatDate(thread.activity_at)}
                </time>
              </Link>
            </li>
          ))}
        </ul>
        {query.hasNextPage && (
          <Button
            className="mt-4"
            variant="outline"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            More conversations
          </Button>
        )}
      </DataState>
    </>
  );
}
