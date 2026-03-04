import BackButton from '@/components/back-button';
import TransactionUserDetails from '@/components/transactions/user-details';
import TransactionItemContent from '@/components/transactions/item-content';
import { InvoiceDownloadButton } from '@/components/transactions/invoice-download';
import { Button } from '@/components/ui/button';
import { DateRangePicker } from '@/components/ui/date-range-picker';
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
import { ChevronRightIcon, DownloadIcon, PackageIcon, TruckIcon } from 'lucide-react';
import { useState } from 'react';
import { Activity } from 'react';
import type { DateRange } from 'react-day-picker';
import { useQuery } from 'convex/react';
import { downloadCsv } from '@/lib/export-csv';

export const Route = createFileRoute('/transactions/sales')({
  component: RouteComponent,
});

function RouteComponent() {
  const {
    results: transactions,
    isLoading,
    status,
    loadMore,
  } = useConvexPaginatedQuery(
    api.transactions.listSalesWithPagination,
    {},
    { initialNumItems: 50 }
  );

  const [dateRange, setDateRange] = useState<DateRange | undefined>();

  const exportData = useQuery(api.exports.exportMySales, {
    from: dateRange?.from?.getTime(),
    to: dateRange?.to
      ? new Date(dateRange.to.getFullYear(), dateRange.to.getMonth(), dateRange.to.getDate(), 23, 59, 59, 999).getTime()
      : undefined,
  });

  const filtered = transactions?.filter((t) => {
    if (dateRange?.from && t._creationTime < dateRange.from.getTime()) return false;
    if (dateRange?.to) {
      const toEnd = new Date(dateRange.to.getFullYear(), dateRange.to.getMonth(), dateRange.to.getDate(), 23, 59, 59, 999);
      if (t._creationTime > toEnd.getTime()) return false;
    }
    return true;
  });

  return (
    <div className="flex flex-col w-full h-full gap-3 overflow-hidden">
      <div className="flex items-center w-full h-auto gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <BackButton />
          <Label className="text-lg">Sales</Label>
        </div>
        <div className="flex items-center gap-3 ml-auto flex-wrap">
          <DateRangePicker value={dateRange} onChange={setDateRange} align="end" />
          <Button
            variant="outline"
            size="sm"
            disabled={!exportData || exportData.length === 0}
            onClick={() => exportData && downloadCsv(exportData as Record<string, unknown>[], 'sales.csv')}
          >
            <DownloadIcon className="size-4" />
            Export CSV
          </Button>
        </div>
      </div>

      <Activity mode={isLoading ? 'visible' : 'hidden'}>
        <div className="flex flex-col w-full h-full items-center justify-center gap-3">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <TruckIcon />
              </EmptyMedia>
              <EmptyTitle>Loading Sales...</EmptyTitle>
              <EmptyDescription>
                Please wait while we load your sales.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      </Activity>

      <Activity mode={isLoading ? 'hidden' : 'visible'}>
        {!filtered ||
          (filtered.length === 0 && (
            <div className="flex flex-col w-full h-full items-center justify-center gap-3">
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <PackageIcon />
                  </EmptyMedia>
                  <EmptyTitle>No Sales Yet</EmptyTitle>
                  <EmptyDescription>
                    Transactions where you are the seller will appear here.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent className="flex-row justify-center gap-2"></EmptyContent>
              </Empty>
            </div>
          ))}

        {filtered && filtered.length > 0 && (
          <div className="flex flex-col w-full h-full overflow-y-auto gap-3">
            {filtered.map((transaction) => (
              <Item variant="muted" key={transaction._id}>
                <TransactionItemContent _id={transaction._id} />

                <ItemActions>
                  <InvoiceDownloadButton transactionId={transaction._id} creationTime={transaction._creationTime} />
                  <TransactionUserDetails _id={transaction.sellerId} />
                  <ChevronRightIcon className="size-4" />
                  <TransactionUserDetails _id={transaction.buyerId} />
                </ItemActions>

                <ItemFooter>
                  {format(new Date(transaction._creationTime), 'PPP p')}
                </ItemFooter>
              </Item>
            ))}

            <Activity mode={status === 'CanLoadMore' ? 'visible' : 'hidden'}>
              <Button variant="outline" onClick={() => loadMore(50)}>
                Load More
              </Button>
            </Activity>
          </div>
        )}
      </Activity>
    </div>
  );
}
