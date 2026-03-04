import { useConvexQuery } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item';
import { Skeleton } from '@/components/ui/skeleton';
import RequestDialog from './request-dialog';

type StockDoc = {
  _id: Id<'stock'>;
  ownerId: Id<'users'>;
  materialId: Id<'materials'>;
  weight: number;
  price: number;
  isListed: boolean;
};

export default function MarketStockItem({ stock }: { stock: StockDoc }) {
  const material = useConvexQuery(api.materials.findById, { _id: stock.materialId });
  const owner = useConvexQuery(api.users.findById, { _id: stock.ownerId });

  return (
    <Item variant="outline">
      <ItemContent>
        {material ? (
          <>
            <ItemTitle>{material.name}</ItemTitle>
            <ItemDescription>
              {owner?.businessName ?? owner?.firstName ?? '...'} · {stock.weight} kg · R
              {stock.price}/kg
            </ItemDescription>
          </>
        ) : (
          <>
            <ItemTitle>
              <Skeleton className="w-32 h-3" />
            </ItemTitle>
            <ItemDescription>
              <Skeleton className="w-64 h-3" />
            </ItemDescription>
          </>
        )}
      </ItemContent>
      <ItemActions>
        <RequestDialog sellerId={stock.ownerId} materialId={stock.materialId} stockId={stock._id} />
      </ItemActions>
    </Item>
  );
}
