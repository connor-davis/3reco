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
import { InboxIcon } from 'lucide-react';
import { Activity } from 'react';

export const Route = createFileRoute('/market/incoming')({
  component: RouteComponent,
});

function RouteComponent() {
  const { results, isLoading, status, loadMore } = useConvexPaginatedQuery(
    api.transactionRequests.listBySeller,
    {},
    { initialNumItems: 20 }
  );

  return (
    <div className="flex flex-col w-full h-full gap-3 overflow-hidden">
      <div className="flex items-center w-full h-auto gap-3">
        <div className="flex items-center gap-3">
          <BackButton />
          <Label className="text-lg">Incoming Requests</Label>
        </div>
      </div>

      <Activity mode={isLoading ? 'visible' : 'hidden'}>
        <div className="flex flex-col w-full h-full items-center justify-center">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <InboxIcon />
              </EmptyMedia>
              <EmptyTitle>Loading Requests...</EmptyTitle>
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
                  <InboxIcon />
                </EmptyMedia>
                <EmptyTitle>No Incoming Requests</EmptyTitle>
                <EmptyDescription>
                  Requests from other businesses will appear here.
                </EmptyDescription>
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
                perspective="seller"
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
