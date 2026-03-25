import { useConvexQuery } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { Badge } from '../ui/badge';
import { ItemContent, ItemDescription, ItemTitle } from '../ui/item';
import { Skeleton } from '../ui/skeleton';

export default function CollectionItemContent({
  _id,
  receiptCount = 0,
}: {
  _id: Id<'transactions'>;
  receiptCount?: number;
}) {
  const transaction = useConvexQuery(api.transactions.findById, { _id });
  const items = transaction?.items ?? [];
  const firstMaterialId = items[0]?.materialId;
  const material = useConvexQuery(
    api.materials.findById,
    firstMaterialId ? { _id: firstMaterialId } : 'skip'
  );

  if (!transaction)
    return (
      <ItemContent>
        <ItemTitle><Skeleton className="w-32 h-3" /></ItemTitle>
        <ItemDescription className="flex flex-col gap-1">
          <Skeleton className="w-full lg:w-96 h-3" />
          <Skeleton className="w-full lg:w-96 h-3" />
        </ItemDescription>
      </ItemContent>
    );

  const totalWeight = items.reduce((s, i) => s + i.weight, 0);
  const totalValue = items.reduce((s, i) => s + i.weight * i.price, 0);
  const titleText = items.length > 1
    ? `${material?.name ?? '...'} +${items.length - 1} more`
    : (material?.name ?? '...');

  return (
    <ItemContent>
      <ItemTitle>
        {titleText}
        {receiptCount > 0 && (
          <Badge variant="secondary" className="ml-1 shrink-0">
            {receiptCount} receipt{receiptCount === 1 ? '' : 's'}
          </Badge>
        )}
      </ItemTitle>
      <ItemDescription>
        {totalWeight.toFixed(2)} kg · R{totalValue.toFixed(2)}
      </ItemDescription>
    </ItemContent>
  );
}
