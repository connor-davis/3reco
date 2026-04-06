import BackButton from '@/components/back-button';
import TransactionPartyDetails from '@/components/transactions/party-details';
import TransactionItemContent from '@/components/transactions/item-content';
import {
  InvoiceDownloadButton,
  ReceiptDownloadButton,
} from '@/components/transactions/invoice-download';
import PageHeaderActions from '@/components/page-header-actions';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useConvexPaginatedQuery } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { createFileRoute } from '@tanstack/react-router';
import { format } from 'date-fns';
import { ChevronRightIcon, CreditCardIcon, DownloadIcon, VanIcon } from 'lucide-react';
import { useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { Activity } from 'react';
import { useQuery } from 'convex/react';
import { downloadCsv } from '@/lib/export-csv';
import { getEffectiveTransactionDate } from '@/lib/transactions';

export const Route = createFileRoute('/transactions/')({
  component: RouteComponent,
});

const TRANSACTION_TYPE_LABELS = {
  all: 'All sales',
  c2b: 'Collector to business',
  b2b: 'Business to business',
} as const;

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

  const [typeFilter, setTypeFilter] = useState<'all' | 'c2b' | 'b2b'>('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();

  const exportData = useQuery(api.exports.exportTransactions, {
    from: dateRange?.from?.getTime(),
    to: dateRange?.to
      ? new Date(dateRange.to.getFullYear(), dateRange.to.getMonth(), dateRange.to.getDate(), 23, 59, 59, 999).getTime()
      : undefined,
  });

  const filtered = transactions?.filter((t) => {
    const effectiveDate = getEffectiveTransactionDate(t);

    if (typeFilter !== 'all' && t.type !== typeFilter) return false;
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

          <Label className="text-lg">Transactions</Label>
        </div>
        <div className="flex w-full items-center justify-end gap-2 sm:ml-auto sm:w-auto sm:gap-3">
          <PageHeaderActions
            title="Transactions"
            description="Filter or export transactions."
          >
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
              <SelectTrigger className="w-full">
                <SelectValue>{TRANSACTION_TYPE_LABELS[typeFilter]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sales</SelectItem>
                <SelectItem value="c2b">Collector to business</SelectItem>
                <SelectItem value="b2b">Business to business</SelectItem>
              </SelectContent>
            </Select>
            <DateRangePicker
              value={dateRange}
              onChange={setDateRange}
              align="start"
              fullWidth
            />
            <Button
              variant="outline"
              className="w-full"
              disabled={!exportData || exportData.length === 0}
              onClick={() => exportData && downloadCsv(exportData as Record<string, unknown>[], 'transactions.csv')}
            >
              <DownloadIcon className="size-4" />
              Download CSV
            </Button>
          </PageHeaderActions>
        </div>
      </div>

      <Activity mode={isLoadingTransactions ? 'visible' : 'hidden'}>
        <div className="flex flex-col w-full h-full items-center justify-center gap-3">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <VanIcon />
              </EmptyMedia>
              <EmptyTitle>Loading transactions...</EmptyTitle>
            </EmptyHeader>
          </Empty>
        </div>
      </Activity>

      <Activity mode={isLoadingTransactions ? 'hidden' : 'visible'}>
        {!filtered ||
          (filtered.length === 0 && (
            <div className="flex flex-col w-full h-full items-center justify-center gap-3">
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <CreditCardIcon />
                  </EmptyMedia>
                  <EmptyTitle>No transactions yet</EmptyTitle>
                  <EmptyDescription>
                    Your sales and purchases will appear here.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent className="flex-row justify-center gap-2"></EmptyContent>
              </Empty>
            </div>
          ))}

        {filtered && filtered.length > 0 && (
          <div className="flex flex-col w-full h-full overflow-y-auto gap-3">
            {filtered?.map((transaction) => {
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

            <Activity
              mode={transactionsStatus === 'CanLoadMore' ? 'visible' : 'hidden'}
            >
              <Button
                variant="outline"
                onClick={() => loadMoreTransactions(50)}
              >
                  Show more
                </Button>
            </Activity>
          </div>
        )}
      </Activity>
    </div>
  );
}
