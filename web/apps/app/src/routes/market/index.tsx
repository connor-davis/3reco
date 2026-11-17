import { useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { SearchX } from 'lucide-react';
import { CardsSkeleton, DataState } from '@/components/data-state';
import { ListingCard } from '@/components/listing-card';
import { ButtonRow } from '@/components/button-row';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import { useListings } from '@/lib/api/listings';
import { filterListings } from './-components/filter-listings';
import { FilterField, Toolbar } from '@/components/toolbar';
import { MarketFilters, MarketSort } from './-components/market-filters';
import { SaveSearch } from './-components/save-search';
import { PriceHistory } from './-components/price-history';
import {
  activeFilterCount,
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
  const results = rangeError
    ? []
    : filterListings(query.data?.items ?? [], sort);
  const go = (next: MarketSearch) =>
    void navigate({ to: '/market', search: next, replace: true });
  // A phone row only fits search and Filters, so sort moves into the sheet there.
  const phone = useIsMobile();
  const sortControl = <MarketSort sort={sort} onSort={setSort} />;

  return (
    <>
      <PageHeader
        title="Find your next material."
        description="Materials from local recyclers. Prices in R / kg."
      />
      <div className="my-6">
        <Toolbar
          label="Search materials or stores"
          value={search.q ?? ''}
          onChange={(value) => go(changeFilter(search, { q: value }))}
          activeFilters={activeFilterCount(search)}
          onClear={() => go({ q: search.q })}
          sheetOnDesktop
          action={phone ? undefined : sortControl}
          filters={
            <>
              {phone && (
                <FilterField label="Sort by">{sortControl}</FilterField>
              )}
              <MarketFilters
                search={search}
                onChange={(change) => go(changeFilter(search, change))}
              />
              <SaveSearch search={search} variant="sheet" />
            </>
          }
        />
      </div>
      {/* The trend line and, on wide screens, Save search; nothing when both are empty. */}
      <div className="-mt-2 mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 empty:hidden">
        <PriceHistory materialId={search.material_id} />
        {search.material_id && <SaveSearch search={search} variant="header" />}
      </div>
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
