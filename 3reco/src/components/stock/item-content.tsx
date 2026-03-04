import { useConvexQuery } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { ItemContent, ItemDescription, ItemTitle } from '../ui/item';
import { Skeleton } from '../ui/skeleton';

export default function StockItemContent({ _id }: { _id: Id<'stock'> }) {
  const stock = useConvexQuery(api.stock.findByStockId, { _id });
  const material = useConvexQuery(
    api.materials.findById,
    stock
      ? {
          _id: stock.materialId,
        }
      : 'skip'
  );

  if (!stock || !material)
    return (
      <ItemContent>
        <ItemTitle>
          <Skeleton className="w-32 h-4" />
        </ItemTitle>
        <ItemDescription className="flex flex-col gap-1">
          <Skeleton className="w-full lg:w-96 h-4" />
          <Skeleton className="w-full lg:w-96 h-4" />
        </ItemDescription>
      </ItemContent>
    );

  return (
    <ItemContent>
      <ItemTitle>{material.name}</ItemTitle>
      <ItemDescription>
        Weight: {stock.weight} | Price: {stock.price} | Listed:{' '}
        {stock.isListed ? 'Yes' : 'No'}
      </ItemDescription>
    </ItemContent>
  );
}
