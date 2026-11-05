import { useConvexQuery } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { ItemContent, ItemDescription, ItemTitle } from '../ui/item';
import { Skeleton } from '../ui/skeleton';

export default function TransactionItemContent({
  _id,
}: {
  _id: Id<'transactions'>;
}) {
  const transaction = useConvexQuery(api.transactions.findById, { _id });
  const items = transaction?.items ?? [];
  const firstMaterialId = items[0]?.materialId;
  const material = useConvexQuery(
    api.materials.findById,
    firstMaterialId ? { _id: firstMaterialId as Id<'materials'> } : 'skip'
  );

  if (!transaction)
    return (
      <ItemContent>
        <ItemTitle>
          <Skeleton className="w-32 h-3" />
        </ItemTitle>
        <ItemDescription className="flex flex-col gap-1">
          <Skeleton className="w-full lg:w-96 h-3" />
          <Skeleton className="w-full lg:w-96 h-3" />
        </ItemDescription>
      </ItemContent>
    );

  const totalWeight = items.reduce((s, i) => s + i.weight, 0);
  const totalValue = items.reduce((s, i) => s + i.weight * i.price, 0);

  const titleText = items.length > 1
    ? `${material?.name ?? '...'} +${items.length - 1} more item${items.length - 1 === 1 ? '' : 's'}`
    : (material?.name ?? '...');

  return (
    <ItemContent>
      <ItemTitle>{titleText}</ItemTitle>
      <ItemDescription>
        {totalWeight.toFixed(2)} kg · R{totalValue.toFixed(2)}
        {items.length > 1 && ` · ${items.length} items`}
      </ItemDescription>
    </ItemContent>
  );
}
