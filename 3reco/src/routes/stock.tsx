import BackButton from '@/components/back-button';
import CreateStockDialog from '@/components/dialogs/stock/create';
import RemoveStockByIdDialog from '@/components/dialogs/stock/remove';
import StockItemContent from '@/components/items/stock';
import { Button } from '@/components/ui/button';
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
import { useConvexPaginatedQuery } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import { createFileRoute } from '@tanstack/react-router';
import { PackageIcon, TrashIcon } from 'lucide-react';

export const Route = createFileRoute('/stock')({
  component: RouteComponent,
});

function RouteComponent() {
  const { results: stock } = useConvexPaginatedQuery(
    api.stock.listWithPagination,
    {},
    {
      initialNumItems: 50,
    }
  );

  return (
    <div className="flex flex-col w-full h-full gap-3 overflow-hidden">
      <div className="flex items-center w-full h-auto gap-3">
        <div className="flex items-center gap-3">
          <BackButton />

          <Label className="text-lg">Stock</Label>
        </div>
        <div className="flex items-center gap-3 ml-auto">
          <CreateStockDialog />
        </div>
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
                  It looks like you haven't added any stock yet. Click the
                  button below to start adding some materials to your stock.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent className="flex-row justify-center gap-2">
                <CreateStockDialog>
                  <Button>Create Stock</Button>
                </CreateStockDialog>
              </EmptyContent>
            </Empty>
          </div>
        ))}

      {stock && stock.length > 0 && (
        <div className="flex flex-col w-full h-full overflow-y-auto gap-3">
          {stock?.map((stock) => (
            <Item variant="muted" key={stock._id}>
              <StockItemContent _id={stock._id} />

              <ItemActions>
                {/*<EditMaterialByIdDialog _id={stock._id}>
                  <Button variant="ghost" size="icon">
                    <PencilIcon />
                  </Button>
                </EditMaterialByIdDialog>*/}

                <RemoveStockByIdDialog _id={stock._id}>
                  <Button variant="destructiveGhost" size="icon">
                    <TrashIcon />
                  </Button>
                </RemoveStockByIdDialog>
              </ItemActions>
            </Item>
          ))}
        </div>
      )}
    </div>
  );
}
