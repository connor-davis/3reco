import { StatusBadge } from '@/components/badges';
import { LinkButton } from '@/components/link-button';
import { formatDate, formatKg, formatRand, formatRate } from '@/lib/format';
import type { TradeRequest } from '@/lib/api/types';
import { requestTotal } from './helpers';

export function DealAside({ request }: { request: TradeRequest }) {
  const hasOffer = request.items.some((item) => item.offer_price !== null);
  return (
    <div className="space-y-6 text-sm">
      <div className="flex flex-wrap justify-between gap-2">
        <StatusBadge status={request.status} />
        <span className="break-all text-muted-foreground">{request.id}</span>
      </div>
      <ul className="space-y-3 rounded-xl border p-4">
        {request.items.map((item, index) => (
          <li key={`${item.material_id}-${index}`} className="space-y-1">
            <p className="font-medium">{item.material_name}</p>
            {item.offer_weight !== null && (
              <p>
                {formatKg(item.offer_weight)} at{' '}
                {formatRate(item.offer_price ?? '0')}
              </p>
            )}
            {item.available_weight !== null && (
              <p className="text-muted-foreground">
                {formatKg(item.available_weight)} available
              </p>
            )}
          </li>
        ))}
      </ul>
      <dl className="space-y-3">
        <Row label="Created" value={formatDate(request.created_at)} />
        <Row label="Buyer" value={request.buyer.name} />
        <Row label="Seller" value={request.seller.name} />
        {hasOffer && (
          <Row label="Offer total" value={formatRand(requestTotal(request))} />
        )}
      </dl>
      <LinkButton
        to="/market/store/$sellerId"
        params={{ sellerId: request.seller.id }}
        variant="outline"
      >
        Visit store
      </LinkButton>
    </div>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
