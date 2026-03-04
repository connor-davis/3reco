import BackButton from '@/components/back-button';
import MarketStockItem from '@/components/market/stock-item';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useConvexPaginatedQuery, useConvexQuery } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import { createFileRoute } from '@tanstack/react-router';
import { SearchIcon, StoreIcon } from 'lucide-react';
import { useState } from 'react';
import { Activity } from 'react';

export const Route = createFileRoute('/market/')({
  component: RouteComponent,
});

function RouteComponent() {
  const {
    results: listings,
    isLoading,
    status,
    loadMore,
  } = useConvexPaginatedQuery(api.stock.listListed, {}, { initialNumItems: 20 });

  const materials = useConvexQuery(api.materials.list, {});
  const [search, setSearch] = useState('');

  const materialNames = new Map(materials?.map((m) => [m._id, m.name]) ?? []);

  const filtered = listings?.filter((item) => {
    if (!search) return true;
    const name = materialNames.get(item.materialId) ?? '';
    return name.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="flex flex-col w-full h-full gap-3 overflow-hidden">
      <div className="flex items-center w-full h-auto gap-3">
        <div className="flex items-center gap-3">
          <BackButton />
          <Label className="text-lg">Browse Market</Label>
        </div>
        <div className="flex items-center gap-3 ml-auto">
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search by material..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-48"
            />
          </div>
        </div>
      </div>

      <Activity mode={isLoading ? 'visible' : 'hidden'}>
        <div className="flex flex-col w-full h-full items-center justify-center">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <StoreIcon />
              </EmptyMedia>
              <EmptyTitle>Loading Listings...</EmptyTitle>
            </EmptyHeader>
          </Empty>
        </div>
      </Activity>

      <Activity mode={isLoading ? 'hidden' : 'visible'}>
        {filtered && filtered.length === 0 && (
          <div className="flex flex-col w-full h-full items-center justify-center">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <StoreIcon />
                </EmptyMedia>
                <EmptyTitle>{search ? 'No results found' : 'No Listings Yet'}</EmptyTitle>
                <EmptyDescription>
                  {search ? `No listings match "${search}".` : 'No stock has been listed for sale yet.'}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        )}
        {filtered && filtered.length > 0 && (
          <div className="flex flex-col w-full h-full overflow-y-auto gap-3">
            {filtered.map((stock) => (
              <MarketStockItem key={stock._id} stock={stock} />
            ))}
            <Activity mode={status === 'CanLoadMore' ? 'visible' : 'hidden'}>
              <Button variant="outline" onClick={() => loadMore(20)}>
                Load More
              </Button>
            </Activity>
          </div>
        )}
      </Activity>
    </div>
  );
}

