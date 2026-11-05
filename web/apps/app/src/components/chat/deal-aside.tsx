import { StatusBadge } from '@/components/badges';
import { LinkButton } from '@/components/link-button';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@/components/ui/item';
import { materialById } from '@/lib/data/materials';
import { storeById } from '@/lib/data/stores';
import { formatDate, formatKg, formatRand, lineCents } from '@/lib/format';
import type { MarketRequest } from '@/lib/types';
import { requestTotal } from './helpers';

/** Right-hand column of the deal room. On phones it opens in a Drawer. */
export function DealAside({ request }: { request: MarketRequest }) {
  const buyer = storeById(request.buyerId);
  const seller = storeById(request.sellerId);
  const hasInvoice = ['Accepted', 'Invoiced', 'Completed'].includes(
    request.status
  );

  return (
    <div className="space-y-6 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusBadge status={request.status} />
        <span className="text-muted-foreground">{request.id}</span>
      </div>
      <ItemGroup className="rounded-xl border">
        {request.items.map((line) => (
          <Item key={line.materialId} size="sm">
            <ItemContent>
              <ItemTitle>{materialById(line.materialId).name}</ItemTitle>
              <ItemDescription>{formatKg(line.kg)}</ItemDescription>
            </ItemContent>
            <ItemActions className="font-medium tabular-nums">
              {formatRand(lineCents(line.pricePerKg, line.kg))}
            </ItemActions>
          </Item>
        ))}
      </ItemGroup>
      <dl className="grid gap-2">
        <Row
          label="Created"
          value={formatDate(request.createdAt.slice(0, 10))}
        />
        <Row label="Buyer" value={buyer.name} />
        <Row label="Seller" value={seller.name} />
        <Row label="Total" value={formatRand(requestTotal(request))} />
        <Row label="Collection area" value={request.collection.area} />
        <Row label="Window" value={request.collection.window} />
      </dl>
      <div className="flex flex-wrap gap-2">
        <LinkButton
          to="/market/store/$sellerId"
          params={{ sellerId: seller.id }}
          variant="outline"
          size="sm"
        >
          Visit store
        </LinkButton>
        {hasInvoice && (
          <LinkButton to="/transactions/purchases" variant="outline" size="sm">
            Invoice
          </LinkButton>
        )}
      </div>
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
