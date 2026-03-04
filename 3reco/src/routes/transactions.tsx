import BackButton from '@/components/back-button';
import TransactionUserDetails from '@/components/transactions/user-details';
import TransactionItemContent from '@/components/transactions/item-content';
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useConvexPaginatedQuery } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import { createFileRoute } from '@tanstack/react-router';
import { format } from 'date-fns';
import { ChevronRightIcon, CreditCardIcon, VanIcon } from 'lucide-react';
import { Activity } from 'react';

export const Route = createFileRoute('/transactions')({
  component: RouteComponent,
});

function RouteComponent() {
  const {
    results: transactions,
    isLoading: isLoadingTransactions,
    status: transactionsStatus,
    loadMore: loadMoreTransactions,
  } = useConvexPaginatedQuery(
    api.transactions.listWithPagination,
    {},
    { initialNumItems: 50 }
  );

  return (
    <div className="flex flex-col w-full h-full gap-3 overflow-hidden">
      <div className="flex items-center w-full h-auto gap-3">
        <div className="flex items-center gap-3">
          <BackButton />

          <Label className="text-lg">Transactions</Label>
        </div>
        <div className="flex items-center gap-3 ml-auto"></div>
      </div>

      <Activity mode={isLoadingTransactions ? 'visible' : 'hidden'}>
        <div className="flex flex-col w-full h-full items-center justify-center gap-3">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <VanIcon />
              </EmptyMedia>
              <EmptyTitle>Loading Transactions...</EmptyTitle>
              <EmptyDescription>
                Please wait while we load your transactions.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      </Activity>

      <Activity mode={isLoadingTransactions ? 'hidden' : 'visible'}>
        {!transactions ||
          (transactions.length === 0 && (
            <div className="flex flex-col w-full h-full items-center justify-center gap-3">
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <CreditCardIcon />
                  </EmptyMedia>
                  <EmptyTitle>No Transactions Yet</EmptyTitle>
                  <EmptyDescription>
                    It looks like there haven't been any transactions yet.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent className="flex-row justify-center gap-2"></EmptyContent>
              </Empty>
            </div>
          ))}

        {transactions && transactions.length > 0 && (
          <div className="flex flex-col w-full h-full overflow-y-auto gap-3">
            {transactions?.map((transaction) => (
              <Item variant="muted" key={transaction._id}>
                <TransactionItemContent _id={transaction._id} />

                <ItemActions>
                  <TransactionUserDetails _id={transaction.sellerId} />
                  <Tooltip>
                    <TooltipTrigger
                      render={<ChevronRightIcon className="size-4" />}
                    />
                    <TooltipContent>Sold To</TooltipContent>
                  </Tooltip>
                  <TransactionUserDetails _id={transaction.buyerId} />
                </ItemActions>

                <ItemFooter>
                  {format(new Date(transaction._creationTime), 'PPP p')}
                </ItemFooter>
              </Item>
            ))}

            <Activity
              mode={transactionsStatus === 'CanLoadMore' ? 'visible' : 'hidden'}
            >
              <Button
                variant="outline"
                onClick={() => loadMoreTransactions(50)}
              >
                Load More
              </Button>
            </Activity>
          </div>
        )}
      </Activity>
    </div>
  );
}
