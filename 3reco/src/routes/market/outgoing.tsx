import BackButton from '@/components/back-button';
import RequestItem from '@/components/market/request-item';
import { Button } from '@/components/ui/button';
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
import { SendIcon } from 'lucide-react';
import { Activity } from 'react';

export const Route = createFileRoute('/market/outgoing')({
  component: RouteComponent,
});

function RouteComponent() {
  const { results, isLoading, status, loadMore } = useConvexPaginatedQuery(
    api.transactionRequests.listByBuyer,
    {},
    { initialNumItems: 20 }
  );

  return (
    <div className="flex flex-col w-full h-full gap-3 overflow-hidden">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <BackButton />
          <Label className="text-lg">Outgoing Requests</Label>
        </div>
      </div>

      <Activity mode={isLoading ? 'visible' : 'hidden'}>
        <div className="flex flex-col w-full h-full items-center justify-center">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SendIcon />
              </EmptyMedia>
              <EmptyTitle>Loading requests...</EmptyTitle>
            </EmptyHeader>
          </Empty>
        </div>
      </Activity>

      <Activity mode={isLoading ? 'hidden' : 'visible'}>
        {results && results.length === 0 && (
          <div className="flex flex-col w-full h-full items-center justify-center">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SendIcon />
                </EmptyMedia>
                <EmptyTitle>No outgoing requests</EmptyTitle>
                <EmptyDescription>Sent requests show here.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        )}
        {results && results.length > 0 && (
          <div className="flex flex-col w-full h-full overflow-y-auto gap-3">
            {results.map((request) => (
              <RequestItem
                key={request._id}
                request={request}
                perspective="buyer"
              />
            ))}
            <Activity mode={status === 'CanLoadMore' ? 'visible' : 'hidden'}>
              <Button variant="outline" onClick={() => loadMore(20)}>
                Load More
              </Button>
            </Activity>
          </div>
        )}
      </Activity>
    </div>
  );
}
