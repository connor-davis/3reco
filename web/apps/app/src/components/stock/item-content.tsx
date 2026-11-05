import { useConvexQuery } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { Badge } from '../ui/badge';
import { ItemContent, ItemDescription, ItemTitle } from '../ui/item';
import { Skeleton } from '../ui/skeleton';

export default function StockItemContent({ _id }: { _id: Id<'stock'> }) {
  const stock = useConvexQuery(api.stock.findByStockId, { _id });
  const material = useConvexQuery(
    api.materials.findById,
    stock ? { _id: stock.materialId } : 'skip'
  );

  if (!stock || !material)
    return (
      <ItemContent>
        <ItemTitle>
          <Skeleton className="w-32 h-4" />
        </ItemTitle>
        <ItemDescription className="flex flex-col gap-1">
          <Skeleton className="w-full lg:w-96 h-4" />
        </ItemDescription>
      </ItemContent>
    );

  return (
    <ItemContent>
      <ItemTitle>
        {material.name}
        {stock.isListed && (
          <Badge variant="secondary" className="ml-1">
            Listed
          </Badge>
        )}
      </ItemTitle>
      <ItemDescription>
        {stock.weight} kg · R{stock.price} per kg
      </ItemDescription>
    </ItemContent>
  );
}
