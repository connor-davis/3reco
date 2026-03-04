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
  const material = useConvexQuery(
    api.materials.findById,
    transaction
      ? {
          _id: transaction.materialId,
        }
      : 'skip'
  );

  if (!transaction || !material)
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

  return (
    <ItemContent>
      <ItemTitle>{material.name}</ItemTitle>
      <ItemDescription>
        Weight: {transaction.weight} | Price: {transaction.price}
      </ItemDescription>
    </ItemContent>
  );
}
