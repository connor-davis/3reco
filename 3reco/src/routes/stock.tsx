import BackButton from '@/components/back-button';
import StockItemContent from '@/components/stock/item-content';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Item, ItemActions } from '@/components/ui/item';
import { Label } from '@/components/ui/label';
import { useConvexQuery } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import { createFileRoute } from '@tanstack/react-router';
import { PackageIcon } from 'lucide-react';

export const Route = createFileRoute('/stock')({
  component: RouteComponent,
});

function RouteComponent() {
  const stock = useConvexQuery(api.stock.list, {});

  return (
    <div className="flex flex-col w-full h-full gap-3 overflow-hidden">
      <div className="flex items-center w-full h-auto gap-3">
        <div className="flex items-center gap-3">
          <BackButton />

          <Label className="text-lg">Stock</Label>
        </div>
        <div className="flex items-center gap-3 ml-auto"></div>
      </div>

      {!stock ||
        (stock.length === 0 && (
          <div className="flex flex-col w-full h-full items-center justify-center gap-3">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <PackageIcon />
                </EmptyMedia>
                <EmptyTitle>No Stock Yet</EmptyTitle>
                <EmptyDescription>
                  It looks like you haven't added any stock yet. Start by
                  creating a new collection or by purchasing stock from the
                  market.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent className="flex-row justify-center gap-2"></EmptyContent>
            </Empty>
          </div>
        ))}

      {stock && stock.length > 0 && (
        <div className="flex flex-col w-full h-full overflow-y-auto gap-3">
          {stock?.map((stock) => (
            <Item variant="muted" key={stock._id}>
              <StockItemContent _id={stock._id} />

              <ItemActions></ItemActions>
            </Item>
          ))}
        </div>
      )}
    </div>
  );
}
