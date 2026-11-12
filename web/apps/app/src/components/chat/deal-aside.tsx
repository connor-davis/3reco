import type { ReactNode } from 'react';
import { BusinessName, StatusBadge } from '@/components/badges';
import { LinkButton } from '@/components/link-button';
import {
  formatDate,
  formatKg,
  formatRand,
  formatRate,
  toGrams,
} from '@/lib/format';
import type { TradeRequest } from '@/lib/api/types';
import { useAuth } from '@/lib/auth/use-auth';
import { requestLabel, requestTotal } from './helpers';
import { useListing } from '@/lib/api/listings';

export function DealAside({ request }: { request: TradeRequest }) {
  const { user } = useAuth();
  const isSeller = user?.id === request.seller.id;
  const hasOffer = request.items.some((item) => item.offer_price !== null);
  return (
    <div className="space-y-6 text-sm">
      <div className="flex flex-wrap justify-between gap-2">
        <StatusBadge status={requestLabel(request, user?.id)} />
      </div>
      <ul className="space-y-3 rounded-lg border p-4">
        {request.items.map((item, index) => (
          <li key={`${item.material_id}-${index}`} className="space-y-1">
            <p className="font-medium">{item.material_name}</p>
            {item.requested_weight && (
              <p className="text-muted-foreground">
                Requested {formatKg(item.requested_weight)} at{' '}
                {formatRate(item.requested_price ?? '0')}
              </p>
            )}
            {item.offer_weight !== null && (
              <p>
                {formatKg(item.offer_weight)} at{' '}
                {formatRate(item.offer_price ?? '0')}
              </p>
            )}
            <Availability stockId={item.stock_id ?? ''} />
          </li>
        ))}
      </ul>
      <dl className="space-y-3">
        <Row label="Created" value={formatDate(request.created_at)} />
        <Row
          label="Buyer"
          value={
            <BusinessName
              name={request.buyer.name}
              verified={request.buyer.business_verified}
            />
          }
        />
        <Row
          label="Seller"
          value={
            <BusinessName
              name={request.seller.name}
              verified={request.seller.business_verified}
            />
          }
        />
        {hasOffer && (
          <Row label="Offer total" value={formatRand(requestTotal(request))} />
        )}
      </dl>
      {(isSeller ? request.buyer.name : request.seller.name) !==
        'Removed account' && (
        <LinkButton
          to="/market/store/$sellerId"
          params={{ sellerId: isSeller ? request.buyer.id : request.seller.id }}
          variant="outline"
          className="w-full"
        >
          Visit {isSeller ? request.buyer.name : request.seller.name}
        </LinkButton>
      )}
    </div>
  );
}
function Availability({ stockId }: { stockId: string }) {
  const listing = useListing(stockId);
  return listing.data ? (
    <p className="text-muted-foreground">
      {formatKg(listing.data.weight)} available
      {toGrams(listing.data.held_weight) > 0 &&
        ` · ${formatKg(listing.data.held_weight)} held`}
    </p>
  ) : (
    <p className="text-muted-foreground">No longer listed</p>
  );
}
function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
