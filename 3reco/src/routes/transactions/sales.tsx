import BackButton from '@/components/back-button';
import TransactionPartyDetails from '@/components/transactions/party-details';
import TransactionItemContent from '@/components/transactions/item-content';
import {
  InvoiceDownloadButton,
  ReceiptDownloadButton,
} from '@/components/transactions/invoice-download';
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
import type { Id } from '@convex/_generated/dataModel';
import { createFileRoute } from '@tanstack/react-router';
import { format } from 'date-fns';
import { ChevronRightIcon, DownloadIcon, PackageIcon, TruckIcon } from 'lucide-react';
import { useState } from 'react';
import { Activity } from 'react';
import type { DateRange } from 'react-day-picker';
import { useQuery } from 'convex/react';
import { downloadCsv } from '@/lib/export-csv';
import { getEffectiveTransactionDate } from '@/lib/transactions';

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
    const effectiveDate = getEffectiveTransactionDate(t);

    if (dateRange?.from && effectiveDate < dateRange.from.getTime()) return false;
    if (dateRange?.to) {
      const toEnd = new Date(dateRange.to.getFullYear(), dateRange.to.getMonth(), dateRange.to.getDate(), 23, 59, 59, 999);
      if (effectiveDate > toEnd.getTime()) return false;
    }
    return true;
  });

  return (
    <div className="flex flex-col w-full h-full gap-3 overflow-hidden">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <BackButton />
          <Label className="text-lg">Sales</Label>
        </div>
        <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:ml-auto sm:w-auto sm:gap-3">
          <DateRangePicker value={dateRange} onChange={setDateRange} align="end" />
          <Button
            variant="outline"
            size="sm"
            disabled={!exportData || exportData.length === 0}
            onClick={() => exportData && downloadCsv(exportData as Record<string, unknown>[], 'sales.csv')}
          >
            <DownloadIcon className="size-4" />
              Download CSV
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
              <EmptyTitle>Loading sales...</EmptyTitle>
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
                  <EmptyTitle>No sales yet</EmptyTitle>
                  <EmptyDescription>Sales show here.</EmptyDescription>
                </EmptyHeader>
                <EmptyContent className="flex-row justify-center gap-2"></EmptyContent>
              </Empty>
            </div>
          ))}

        {filtered && filtered.length > 0 && (
          <div className="flex flex-col w-full h-full overflow-y-auto gap-3">
            {filtered.map((transaction) => {
              const effectiveDate = getEffectiveTransactionDate(transaction);

              return (
                <Item variant="backgroundOutline" key={transaction._id}>
                  <TransactionItemContent _id={transaction._id} />

                  <ItemActions>
                    {transaction.type === 'c2b' ? (
                      <ReceiptDownloadButton
                        transactionId={transaction._id}
                        attachments={transaction.receiptAttachments ?? []}
                      />
                    ) : null}
                    <InvoiceDownloadButton
                      transactionId={transaction._id}
                      creationTime={transaction._creationTime}
                      transactionDate={effectiveDate}
                    />
                    <TransactionPartyDetails
                      {...(transaction.type === 'c2b'
                        ? { collectorId: transaction.sellerId as Id<'collectors'> }
                        : { userId: transaction.sellerId as Id<'users'> })}
                    />
                    <ChevronRightIcon className="size-4" />
                    <TransactionPartyDetails userId={transaction.buyerId} />
                  </ItemActions>

                  <ItemFooter>
                    {format(new Date(effectiveDate), 'dd/MM/yyyy')}
                  </ItemFooter>
                </Item>
              );
            })}

            <Activity mode={status === 'CanLoadMore' ? 'visible' : 'hidden'}>
              <Button variant="outline" onClick={() => loadMore(50)}>
                  Show more
                </Button>
            </Activity>
          </div>
        )}
      </Activity>
    </div>
  );
}
