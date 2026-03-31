import BackButton from '@/components/back-button';
import CreateCollectionDialog from '@/components/dialogs/collections/create';
import CollectionItemContent from '@/components/collections/item-content';
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
import { useConvexPaginatedQuery } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { createFileRoute } from '@tanstack/react-router';
import { format } from 'date-fns';
import { DownloadIcon, VanIcon } from 'lucide-react';
import { useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { Activity } from 'react';
import TransactionPartyDetails from '@/components/transactions/party-details';
import { useQuery } from 'convex/react';
import { downloadCsv } from '@/lib/export-csv';
import { getEffectiveTransactionDate } from '@/lib/transactions';

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

  const [dateRange, setDateRange] = useState<DateRange | undefined>();

  const exportData = useQuery(api.exports.exportCollections, {
    from: dateRange?.from?.getTime(),
    to: dateRange?.to
      ? new Date(dateRange.to.getFullYear(), dateRange.to.getMonth(), dateRange.to.getDate(), 23, 59, 59, 999).getTime()
      : undefined,
  });

  const filtered = collections?.filter((c) => {
    if (c.type !== 'c2b') return false;

    const effectiveDate = getEffectiveTransactionDate(c);

    if (dateRange?.from && effectiveDate < dateRange.from.getTime()) return false;
    if (dateRange?.to) {
      const toEnd = new Date(dateRange.to.getFullYear(), dateRange.to.getMonth(), dateRange.to.getDate(), 23, 59, 59, 999);
      if (effectiveDate > toEnd.getTime()) return false;
    }
    return true;
  });

  return (
    <div className="flex flex-col w-full h-full gap-3 overflow-hidden">
      <div className="flex items-center w-full h-auto gap-3">
        <div className="flex items-center gap-3">
          <BackButton />

          <Label className="text-lg">Collections</Label>
        </div>
        <div className="flex items-center gap-3 ml-auto">
          <PageHeaderActions
            title="Manage collections"
            description="Filter collections, export data, or create a new collection."
          >
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
              onClick={() => exportData && downloadCsv(exportData as Record<string, unknown>[], 'collections.csv')}
            >
              <DownloadIcon className="size-4" />
              Export CSV
            </Button>
            <CreateCollectionDialog>
              <Button className="w-full">Create Collection</Button>
            </CreateCollectionDialog>
          </PageHeaderActions>
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
        {!filtered ||
          (filtered.length === 0 && (
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

        {filtered && filtered.length > 0 && (
          <div className="flex flex-col w-full h-full overflow-y-auto gap-3">
            {filtered?.map((collection) => {
              const effectiveDate = getEffectiveTransactionDate(collection);

              return (
                <Item variant="muted" key={collection._id}>
                  <CollectionItemContent
                    _id={collection._id}
                    receiptCount={collection.receiptAttachments?.length ?? 0}
                  />

                  <ItemActions>
                    <ReceiptDownloadButton
                      transactionId={collection._id}
                      attachments={collection.receiptAttachments ?? []}
                    />
                    <InvoiceDownloadButton
                      transactionId={collection._id}
                      creationTime={collection._creationTime}
                      transactionDate={effectiveDate}
                    />
                    <TransactionPartyDetails
                      collectorId={collection.sellerId as Id<'collectors'>}
                    />
                  </ItemActions>

                  <ItemFooter>
                    {format(new Date(effectiveDate), 'dd/MM/yyyy')}
                  </ItemFooter>
                </Item>
              );
            })}

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
