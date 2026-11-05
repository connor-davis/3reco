import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import {
  Leaf,
  List,
  MapIcon,
  MessageCircle,
  SearchX,
  SlidersHorizontal,
} from 'lucide-react';
import { CardsSkeleton, DataState } from '@/components/data-state';
import { SearchBox } from '@/components/filters';
import { LinkButton } from '@/components/link-button';
import { ListingCard } from '@/components/listing-card';
import { PageHeader } from '@/components/page-header';
import { ResponsiveOverlay } from '@/components/responsive-overlay';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { formatKg } from '@/lib/format';
import { community, formatCo2 } from '@/lib/impact';
import { useMock, useMarketListings } from '@/lib/mock/hooks';
import { filterListings } from './-components/filter-listings';
import { MarketMap } from './-components/market-map';
import {
  CategoryChips,
  defaultFilters,
  SelectFilters,
} from './-components/market-filters';

export const Route = createFileRoute('/market/')({
  component: MarketPage,
});

type View = 'list' | 'map';

function MarketPage() {
  const { role } = useMock();
  const listings = useMarketListings();
  const [filters, setFilters] = useState(defaultFilters);
  const [view, setView] = useState<View>('list');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const results = filterListings(listings, filters);

  return (
    <>
      <PageHeader
        title="Find your next material."
        description="Prices are in R / kg. Bigger lots get lower rates."
        actions={
          role === 'business' && <LinkButton to="/cart">Your cart</LinkButton>
        }
      />
      <ImpactStrip />
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <SearchBox
          label="Search materials, stores or suburbs"
          value={filters.query}
          onChange={(query) => setFilters({ ...filters, query })}
          className="w-full sm:w-auto sm:flex-1"
        />
        <div className="hidden items-center gap-3 sm:flex">
          <SelectFilters values={filters} onChange={setFilters} />
        </div>
        <Button
          variant="outline"
          className="sm:hidden"
          onClick={() => setFiltersOpen(true)}
        >
          <SlidersHorizontal data-icon="inline-start" />
          Filters
        </Button>
        <ViewToggle view={view} onChange={setView} />
      </div>
      <div className="mt-4">
        <CategoryChips values={filters} onChange={setFilters} />
      </div>
      <p className="mt-6 mb-4 flex justify-between text-sm text-muted-foreground">
        <span>{results.length} listings from local recyclers</span>
        <span>Prices in R / kg</span>
      </p>
      <DataState
        isEmpty={results.length === 0}
        icon={SearchX}
        emptyTitle="No materials found"
        emptyText="Try a different search or clear the filters."
        emptyAction={
          <Button variant="outline" onClick={() => setFilters(defaultFilters)}>
            Clear filters
          </Button>
        }
        skeleton={<CardsSkeleton />}
      >
        {view === 'map' ? (
          <MarketMap listings={results} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {results.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}
      </DataState>
      <ResponsiveOverlay
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        title="Filters"
        description="Narrow the materials by place, order and supplier."
        footer={
          <Button onClick={() => setFiltersOpen(false)}>Show results</Button>
        }
      >
        <div className="grid gap-4">
          <SelectFilters values={filters} onChange={setFilters} />
        </div>
      </ResponsiveOverlay>
    </>
  );
}

function ViewToggle({
  view,
  onChange,
}: {
  view: View;
  onChange: (view: View) => void;
}) {
  return (
    <ToggleGroup
      aria-label="Show listings as"
      variant="outline"
      value={[view]}
      onValueChange={(next) => next[0] && onChange(next[0] as View)}
    >
      <ToggleGroupItem value="list" aria-label="List">
        <List />
        List
      </ToggleGroupItem>
      <ToggleGroupItem value="map" aria-label="Map">
        <MapIcon />
        Map
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

/** Fixed community numbers (design 09). They never tick. */
function ImpactStrip() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-muted/50 px-4 py-3">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Leaf className="size-4 text-primary" aria-hidden="true" />
        Community impact so far: {formatKg(community.kgDiverted)} diverted,{' '}
        {formatCo2(community.co2Kg)} saved
      </p>
      <LinkButton to="/messages" variant="ghost" size="sm">
        <MessageCircle data-icon="inline-start" />A better deal starts with
        "hello"
      </LinkButton>
    </div>
  );
}
