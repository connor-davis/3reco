import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Leaf, SearchX } from 'lucide-react';
import { CardsSkeleton, DataState } from '@/components/data-state';
import { SearchBox } from '@/components/filters';
import { LinkButton } from '@/components/link-button';
import { ListingCard } from '@/components/listing-card';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useListings } from '@/lib/api/listings';
import { useStats } from '@/lib/api/stats';
import { useAuth } from '@/lib/auth/use-auth';
import { formatKg, plural } from '@/lib/format';
import { formatCo2 } from '@/lib/impact';
import { filterListings } from './-components/filter-listings';
import { MarketFilters } from './-components/market-filters';

export const Route = createFileRoute('/market/')({ component: MarketPage });

function MarketPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [cursor, setCursor] = useState<string>();
  const [sort, setSort] = useState('newest');
  const query = useListings({ q: search, cursor });
  const stats = useStats();
  const results = filterListings(query.data?.items ?? [], sort);

  return (
    <>
      <PageHeader
        title="Find your next material."
        description="Materials from local recyclers. Prices in R / kg."
        actions={
          user?.role === 'business' && (
            <LinkButton to="/cart">Your cart</LinkButton>
          )
        }
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
      <div className="my-6 flex flex-wrap gap-3">
        <SearchBox
          label="Search materials or stores"
          value={search}
          onChange={(value) => {
            setSearch(value);
            setCursor(undefined);
          }}
        />
        <MarketFilters sort={sort} onChange={setSort} />
      </div>
      <DataState
        query={query}
        isEmpty={!results.length}
        icon={SearchX}
        emptyTitle="No materials found"
        emptyText="Try a different search."
        skeleton={<CardsSkeleton />}
      >
        <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:gap-4 xl:grid-cols-3 2xl:grid-cols-4">
          {results.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      </DataState>
      <div className="my-6 flex gap-3">
        {cursor && (
          <Button variant="outline" onClick={() => setCursor(undefined)}>
            First page
          </Button>
        )}
        {query.data?.has_more && (
          <Button
            variant="outline"
            onClick={() => setCursor(query.data?.next_cursor ?? undefined)}
          >
            Next page
          </Button>
        )}
      </div>
    </>
  );
}
