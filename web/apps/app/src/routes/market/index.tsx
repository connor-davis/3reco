import { useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Leaf, SearchX } from 'lucide-react';
import { CardsSkeleton, DataState } from '@/components/data-state';
import { SearchBox } from '@/components/filters';
import { ListingCard } from '@/components/listing-card';
import { ButtonRow } from '@/components/button-row';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useListings } from '@/lib/api/listings';
import { useStats } from '@/lib/api/stats';
import { formatKg, plural } from '@/lib/format';
import { formatCo2 } from '@/lib/impact';
import { filterListings } from './-components/filter-listings';
import { MarketFilters } from './-components/market-filters';
import { SaveSearch } from './-components/save-search';
import { PriceHistory } from './-components/price-history';
import {
  changeFilter,
  parseMarketSearch,
  priceRangeError,
  type MarketSearch,
} from './-components/market-search';

export const Route = createFileRoute('/market/')({
  validateSearch: parseMarketSearch,
  component: MarketPage,
});

function MarketPage() {
  // Every filter and the page cursor live in the URL.
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [sort, setSort] = useState('newest');
  const rangeError = priceRangeError(search.min_price, search.max_price);
  const query = useListings(search, !rangeError, { keepPrevious: true });
  const stats = useStats();
  const results = rangeError
    ? []
    : filterListings(query.data?.items ?? [], sort);
  const go = (next: MarketSearch) =>
    void navigate({ to: '/market', search: next, replace: true });

  return (
    <>
      <PageHeader
        title="Find your next material."
        description="Materials from local recyclers. Prices in R / kg."
      />
      <DataState
        query={stats}
        icon={Leaf}
        emptyTitle="Community impact"
        emptyText="Completed trades appear here."
        skeleton={<Skeleton className="h-[46px] rounded-lg" />}
      >
        {stats.data && (
          <p className="rounded-lg border bg-muted/50 px-4 py-3 text-sm">
            Community impact: {formatKg(stats.data.total_kg)} diverted ·{' '}
            {formatCo2(stats.data.co2_kg)} · {plural(stats.data.deals, 'trade')}
          </p>
        )}
      </DataState>
      <div className="my-6 flex flex-wrap items-center gap-2 sm:gap-3">
        <SearchBox
          label="Search materials or stores"
          value={search.q ?? ''}
          onChange={(value) => go(changeFilter(search, { q: value }))}
        />
        <MarketFilters
          search={search}
          sort={sort}
          onSort={setSort}
          onChange={(change) => go(changeFilter(search, change))}
        />
      </div>
      <SaveSearch search={search} />
      <PriceHistory materialId={search.material_id} />
      <DataState
        query={query}
        isEmpty={!results.length}
        icon={SearchX}
        emptyTitle="No materials found"
        emptyText={rangeError || 'Try a different search.'}
        skeleton={<CardsSkeleton />}
      >
        <div className="grid grid-cols-1 gap-x-3 gap-y-5 sm:gap-4 md:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {results.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      </DataState>
      <ButtonRow className="my-6">
        {search.cursor && (
          <Button
            variant="outline"
            onClick={() => go({ ...search, cursor: undefined })}
          >
            First page
          </Button>
        )}
        {query.data?.has_more && (
          <Button
            variant="outline"
            onClick={() =>
              go({ ...search, cursor: query.data?.next_cursor ?? undefined })
            }
          >
            Next page
          </Button>
        )}
      </ButtonRow>
    </>
  );
}
