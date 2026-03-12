import BackButton from '@/components/back-button';
import ListToggle from '@/components/stock/list-toggle';
import StockItemContent from '@/components/stock/item-content';
import PageHeaderActions from '@/components/page-header-actions';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Item, ItemActions } from '@/components/ui/item';
import { Label } from '@/components/ui/label';
import { useConvexQuery } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import { createFileRoute } from '@tanstack/react-router';
import { PackageIcon, SearchIcon } from 'lucide-react';
import { useState } from 'react';

export const Route = createFileRoute('/stock')({
  component: RouteComponent,
});

function RouteComponent() {
  const stock = useConvexQuery(api.stock.list, {});
  const materials = useConvexQuery(api.materials.list, {});
  const [search, setSearch] = useState('');

  const materialNames = new Map(materials?.map((m) => [m._id, m.name]) ?? []);

  const filtered = stock?.filter((item) => {
    if (!search) return true;
    const name = materialNames.get(item.materialId) ?? '';
    return name.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="flex flex-col w-full h-full gap-3 overflow-hidden">
      <div className="flex items-center w-full h-auto gap-3">
        <div className="flex items-center gap-3">
          <BackButton />

          <Label className="text-lg">Stock</Label>
        </div>
        <div className="flex items-center gap-3 ml-auto">
          <PageHeaderActions
            title="Filter stock"
            description="Search stock by material."
          >
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search by material..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 w-full"
              />
            </div>
          </PageHeaderActions>
        </div>
      </div>

      {!filtered ||
        (filtered.length === 0 && (
          <div className="flex flex-col w-full h-full items-center justify-center gap-3">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <PackageIcon />
                </EmptyMedia>
                <EmptyTitle>{search ? 'No results found' : 'No Stock Yet'}</EmptyTitle>
                <EmptyDescription>
                  {search
                    ? `No stock matches "${search}".`
                    : 'It looks like you haven\'t added any stock yet. Start by creating a new collection or by purchasing stock from the market.'}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent className="flex-row justify-center gap-2"></EmptyContent>
            </Empty>
          </div>
        ))}

      {filtered && filtered.length > 0 && (
        <div className="flex flex-col w-full h-full overflow-y-auto gap-3">
          {filtered?.map((item) => (
            <Item variant="muted" key={item._id}>
              <StockItemContent _id={item._id} />

              <ItemActions>
                <ListToggle _id={item._id} isListed={item.isListed} />
              </ItemActions>
            </Item>
          ))}
        </div>
      )}
    </div>
  );
}
