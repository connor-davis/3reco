import BackButton from '@/components/back-button';
import RequestItem from '@/components/market/request-item';
import { VirtualizedPaginatedList } from '@/components/virtualized-paginated-list';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Label } from '@/components/ui/label';
import { useConvexPaginatedQuery } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import { createFileRoute } from '@tanstack/react-router';
import { InboxIcon } from 'lucide-react';

export const Route = createFileRoute('/market/incoming')({
  component: RouteComponent,
});

function RouteComponent() {
  const { results, status, loadMore } = useConvexPaginatedQuery(
    api.transactionRequests.listBySeller,
    {},
    { initialNumItems: 20 }
  );
  const isInitialLoading = status === 'LoadingFirstPage';
  const isLoadingMore = status === 'LoadingMore';
  const canLoadMore = status === 'CanLoadMore' || isLoadingMore;

  return (
    <div className="flex flex-col w-full h-full gap-3 overflow-hidden">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <BackButton />
          <Label className="text-lg">Incoming Requests</Label>
        </div>
      </div>

      {isInitialLoading ? (
        <div className="flex flex-col w-full h-full items-center justify-center">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <InboxIcon />
              </EmptyMedia>
              <EmptyTitle>Loading requests...</EmptyTitle>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <>
        {results && results.length === 0 && (
          <div className="flex flex-col w-full h-full items-center justify-center">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <InboxIcon />
                </EmptyMedia>
                <EmptyTitle>No incoming requests</EmptyTitle>
                <EmptyDescription>
                  Requests from buyers will appear here.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        )}
        {results && results.length > 0 && (
          <VirtualizedPaginatedList
            className="h-full"
            items={results}
            hasMore={canLoadMore}
            isLoadingMore={isLoadingMore}
            loadMore={() => loadMore(20)}
            getItemKey={(request) => request._id}
            renderItem={(request) => (
              <RequestItem
                key={request._id}
                request={request}
                perspective="seller"
              />
            )}
          />
        )}
        </>
      )}
    </div>
  );
}
