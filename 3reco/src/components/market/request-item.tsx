import { Badge } from '@/components/ui/badge';
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item';
import { Skeleton } from '@/components/ui/skeleton';
import { useConvexQuery } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { Link } from '@tanstack/react-router';

type RequestDoc = {
  _id: Id<'transactionRequests'>;
  sellerId: Id<'users'>;
  buyerId: Id<'users'>;
  materialId?: Id<'materials'>;
  items?: Array<{ materialId?: Id<'materials'>; stockId: Id<'stock'> }>;
  status: 'pending' | 'offered' | 'accepted' | 'rejected' | 'cancelled';
};

const statusVariant: Record<
  RequestDoc['status'],
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  pending: 'secondary',
  offered: 'outline',
  accepted: 'default',
  rejected: 'destructive',
  cancelled: 'outline',
};

const statusLabel: Record<RequestDoc['status'], string> = {
  pending: 'Pending',
  offered: 'Offer sent',
  accepted: 'Accepted',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

export default function RequestItem({
  request,
  perspective,
}: {
  request: RequestDoc;
  perspective: 'buyer' | 'seller';
}) {
  const firstMaterialId =
    request.items?.[0]?.materialId ?? request.materialId;
  const material = useConvexQuery(
    api.materials.findById,
    firstMaterialId ? { _id: firstMaterialId } : 'skip'
  );
  const counterpartyId = perspective === 'buyer' ? request.sellerId : request.buyerId;
  const counterparty = useConvexQuery(api.users.findById, { _id: counterpartyId });
  const itemCount = request.items?.length ?? 1;

  return (
    <Link to="/market/$requestId" params={{ requestId: request._id }}>
      <Item variant="muted">
        <ItemContent>
          {firstMaterialId !== undefined ? (
            <>
              <ItemTitle>
                {material?.name ?? <Skeleton className="w-32 h-3 inline-block" />}
                {itemCount > 1 && ` +${itemCount - 1} more item${itemCount - 1 === 1 ? '' : 's'}`}
              </ItemTitle>
              <ItemDescription>
                {perspective === 'buyer' ? 'Selling business' : 'Buyer'}:{' '}
                {counterparty?.businessName ?? counterparty?.firstName ?? '...'}
              </ItemDescription>
            </>
          ) : (
            <>
              <ItemTitle><Skeleton className="w-32 h-3" /></ItemTitle>
              <ItemDescription><Skeleton className="w-48 h-3" /></ItemDescription>
            </>
          )}
        </ItemContent>
        <ItemActions>
          <Badge variant={statusVariant[request.status]}>
            {statusLabel[request.status]}
          </Badge>
        </ItemActions>
      </Item>
    </Link>
  );
}
