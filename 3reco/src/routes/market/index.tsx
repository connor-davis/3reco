import BackButton from '@/components/back-button';
import Stars from '@/components/reviews/stars';
import PageHeaderActions from '@/components/page-header-actions';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useConvexQuery } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { Link, createFileRoute } from '@tanstack/react-router';
import { BuildingIcon, SearchIcon, StoreIcon } from 'lucide-react';
import { useState } from 'react';
import { Activity } from 'react';

export const Route = createFileRoute('/market/')({
  component: RouteComponent,
});

function SellerCard({ seller }: { seller: { _id: string; displayName: string; itemCount: number; materialNames: string[] } }) {
  const avg = useConvexQuery(api.reviews.averageForSeller, { sellerId: seller._id as Id<'users'> });

  return (
    <Link
      to="/market/store/$sellerId"
      params={{ sellerId: seller._id }}
      className="flex flex-col gap-2 p-4 border rounded-xl hover:bg-accent transition-colors"
    >
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center size-10 rounded-full bg-muted">
          <BuildingIcon className="size-5 text-muted-foreground" />
        </div>
        <div className="flex flex-col">
          <span className="font-medium text-sm">{seller.displayName}</span>
          <span className="text-xs text-muted-foreground">
            {seller.itemCount} listing{seller.itemCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
      {avg && (
        <Stars rating={avg.average} count={avg.count} size="sm" className="ml-0.5" />
      )}
      {seller.materialNames.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {seller.materialNames.slice(0, 4).map((name) => (
            <span
              key={name}
              className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
            >
              {name}
            </span>
          ))}
          {seller.materialNames.length > 4 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              +{seller.materialNames.length - 4} more
            </span>
          )}
        </div>
      )}
    </Link>
  );
}

function RouteComponent() {
  const sellers = useConvexQuery(api.stock.listSellersWithStock, {});
  const [search, setSearch] = useState('');

  const filtered = sellers?.filter((seller) => {
    if (!search) return true;
    const lower = search.toLowerCase();
    return (
      seller.displayName.toLowerCase().includes(lower) ||
      seller.materialNames.some((n) => n.toLowerCase().includes(lower))
    );
  });

  const isLoading = sellers === undefined;

  return (
    <div className="flex flex-col w-full h-full gap-3 overflow-hidden">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <BackButton />
          <Label className="text-lg">Browse Market</Label>
        </div>
        <div className="flex w-full items-center justify-end gap-2 sm:ml-auto sm:w-auto sm:gap-3">
          <PageHeaderActions
            title="Marketplace"
            description="Search sellers and materials."
          >
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search sellers or materials..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 w-full"
              />
            </div>
          </PageHeaderActions>
        </div>
      </div>

      <Activity mode={isLoading ? 'visible' : 'hidden'}>
        <div className="flex flex-col w-full h-full items-center justify-center">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon"><StoreIcon /></EmptyMedia>
              <EmptyTitle>Finding sellers...</EmptyTitle>
            </EmptyHeader>
          </Empty>
        </div>
      </Activity>

      <Activity mode={isLoading ? 'hidden' : 'visible'}>
        {filtered && filtered.length === 0 && (
          <div className="flex flex-col w-full h-full items-center justify-center">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><StoreIcon /></EmptyMedia>
                <EmptyTitle>{search ? 'No results found' : 'No sellers yet'}</EmptyTitle>
                <EmptyDescription>
                  {search
                    ? `No sellers match "${search}".`
                    : 'No one is selling stock right now.'}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        )}
        {filtered && filtered.length > 0 && (
          <div className="grid grid-cols-1 gap-3 overflow-y-auto pb-2 sm:grid-cols-2 xl:grid-cols-4">
            {filtered.map((seller) => (
              <SellerCard key={seller._id} seller={seller} />
            ))}
          </div>
        )}
      </Activity>
    </div>
  );
}
