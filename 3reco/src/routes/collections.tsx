import BackButton from '@/components/back-button';
import CreateCollectionDialog from '@/components/dialogs/collections/create';
import CollectionItemContent from '@/components/collections/item-content';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Item, ItemActions, ItemFooter } from '@/components/ui/item';
import { Label } from '@/components/ui/label';
import { useConvexPaginatedQuery } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import { createFileRoute } from '@tanstack/react-router';
import { format } from 'date-fns';
import { VanIcon } from 'lucide-react';
import { Activity } from 'react';
import TransactionUserDetails from '@/components/transactions/user-details';

export const Route = createFileRoute('/collections')({
  component: RouteComponent,
});

function RouteComponent() {
  const {
    results: collections,
    isLoading: isLoadingCollections,
    status: collectionsStatus,
    loadMore: loadMoreCollections,
  } = useConvexPaginatedQuery(
    api.transactions.listExpensesWithPagination,
    {},
    { initialNumItems: 50 }
  );

  return (
    <div className="flex flex-col w-full h-full gap-3 overflow-hidden">
      <div className="flex items-center w-full h-auto gap-3">
        <div className="flex items-center gap-3">
          <BackButton />

          <Label className="text-lg">Collections</Label>
        </div>
        <div className="flex items-center gap-3 ml-auto">
          <CreateCollectionDialog />
        </div>
      </div>

      <Activity mode={isLoadingCollections ? 'visible' : 'hidden'}>
        <div className="flex flex-col w-full h-full items-center justify-center gap-3">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <VanIcon />
              </EmptyMedia>
              <EmptyTitle>Loading Collections...</EmptyTitle>
              <EmptyDescription>
                Please wait while we load your collections.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      </Activity>

      <Activity mode={isLoadingCollections ? 'hidden' : 'visible'}>
        {!collections ||
          (collections.length === 0 && (
            <div className="flex flex-col w-full h-full items-center justify-center gap-3">
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <VanIcon />
                  </EmptyMedia>
                  <EmptyTitle>No Collections Yet</EmptyTitle>
                  <EmptyDescription>
                    It looks like you haven't added any collections yet.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent className="flex-row justify-center gap-2">
                  <CreateCollectionDialog>
                    <Button>Create Collection</Button>
                  </CreateCollectionDialog>
                </EmptyContent>
              </Empty>
            </div>
          ))}

        {collections && collections.length > 0 && (
          <div className="flex flex-col w-full h-full overflow-y-auto gap-3">
            {collections?.map((collection) => (
              <Item variant="muted" key={collection._id}>
                <CollectionItemContent _id={collection._id} />

                <ItemActions>
                  <TransactionUserDetails _id={collection.sellerId} />
                </ItemActions>

                <ItemFooter>
                  {format(new Date(collection._creationTime), 'PPP p')}
                </ItemFooter>
              </Item>
            ))}

            <Activity
              mode={collectionsStatus === 'CanLoadMore' ? 'visible' : 'hidden'}
            >
              <Button variant="outline" onClick={() => loadMoreCollections(50)}>
                Load More
              </Button>
            </Activity>
          </div>
        )}
      </Activity>
    </div>
  );
}
