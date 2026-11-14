import { LinkButton } from '@/components/link-button';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useAuth } from '@/lib/auth/use-auth';
import { useDownloadInvoice } from '@/lib/api/transactions';
import type { TradeRequest } from '@/lib/api/types';
import {
  formatKg,
  formatRand,
  formatRate,
  formatTime,
  lineCents,
  plural,
} from '@/lib/format';
import { offerStatusLine, requestTotal } from './helpers';
import { useRequest } from '@/lib/api/requests';

export function ThreadMaterials({ requestId }: { requestId: string }) {
  const request = useRequest(requestId);

  return (
    <span className="block truncate text-sm text-muted-foreground">
      {request.isPending
        ? 'Loading materials…'
        : request.isError
          ? 'Materials unavailable'
          : request.data?.items
              .map((item) => {
                const weight = item.offer_weight ?? item.requested_weight;
                return `${item.material_name}${weight ? ` · ${formatKg(weight)}` : ''}`;
              })
              .join(', ')}
    </span>
  );
}

export function OfferCard({
  request,
  canRespond,
  onAccept,
  onDecline,
  disabled,
}: {
  request: TradeRequest;
  canRespond: boolean;
  onAccept: () => void;
  onDecline: () => void;
  disabled: boolean;
}) {
  const { user } = useAuth();
  // An admin reading someone else's chat is on neither side of the deal.
  const onlooker =
    user?.id !== request.buyer.id && user?.id !== request.seller.id;
  const buyerConfirmed =
    request.buyer_confirmed_version === request.offer_version;
  const sellerConfirmed =
    request.seller_confirmed_version === request.offer_version;
  return (
    <Card size="sm" className="max-w-sm pt-0">
      <CardHeader className="bg-accent py-3">
        <CardTitle>
          Offer · {plural(request.items.length, 'material')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Current deal status ·{' '}
          <time dateTime={request.updated_at}>
            {formatTime(request.updated_at)}
          </time>
        </p>
        <ul className="space-y-3">
          {request.items.map((item, index) => (
            <li
              key={`${item.material_id}-${index}`}
              className="flex justify-between gap-4"
            >
              <span className="min-w-0 break-words">
                {item.material_name}
                <span className="block text-xs text-muted-foreground">
                  {formatKg(item.offer_weight ?? '0')} at{' '}
                  {formatRate(item.offer_price ?? '0')}
                </span>
              </span>
              <span className="shrink-0 text-right whitespace-nowrap tabular-nums">
                {formatRand(
                  lineCents(item.offer_price ?? '0', item.offer_weight ?? '0')
                )}
              </span>
            </li>
          ))}
        </ul>
        <p className="flex justify-between border-t pt-3 font-semibold">
          <span>Total</span>
          <span className="whitespace-nowrap tabular-nums">
            {formatRand(requestTotal(request))}
          </span>
        </p>
        <p className="text-muted-foreground">
          Stock is reserved for 48 hours from this offer. Both sides must
          confirm before stock moves and an invoice is made.
        </p>
        <ul aria-label="Offer confirmations" className="space-y-1">
          <li>
            Buyer:{' '}
            {request.buyer_confirmed_version === request.offer_version
              ? 'Confirmed'
              : 'Not confirmed'}
          </li>
          <li>
            Seller:{' '}
            {request.seller_confirmed_version === request.offer_version
              ? 'Confirmed'
              : 'Not confirmed'}
          </li>
        </ul>
        {onlooker ? (
          (buyerConfirmed || sellerConfirmed) && (
            <p role="status">
              {buyerConfirmed
                ? 'Buyer accepted; waiting for the seller.'
                : 'Seller accepted; waiting for the buyer.'}
            </p>
          )
        ) : (
          <p role="status">{offerStatusLine(request, user?.id)}</p>
        )}
      </CardContent>
      {canRespond && (
        <CardFooter className="gap-3">
          <Button disabled={disabled} onClick={onAccept}>
            Confirm
          </Button>
          <Button variant="outline" disabled={disabled} onClick={onDecline}>
            Reject offer
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

// Staff are on neither side of the deal, so they open the all-trades list.
function transactionsPath(
  request: TradeRequest,
  user:
    | { id: string; role: string | null; active_business_id?: string }
    | null
    | undefined
): string {
  if (user?.role === 'business') {
    const party = user.active_business_id;
    if (party === request.seller.id) return '/transactions?filter=sold';
    if (party === request.buyer.id) return '/transactions?filter=bought';
    return '/transactions';
  }
  if (user?.id === request.seller.id) return '/transactions/sales';
  if (user?.id === request.buyer.id) return '/transactions/purchases';

  return '/transactions';
}

export function InvoiceCard({
  request,
  transactionId,
}: {
  request: TradeRequest;
  transactionId?: string;
}) {
  const { user } = useAuth();
  const download = useDownloadInvoice();
  transactionId ??= (request as TradeRequest & { transaction_id?: string })
    .transaction_id;
  const transactionsTo = transactionsPath(request, user);
  return (
    <Card size="sm" className="max-w-sm">
      <CardHeader>
        <CardTitle>Complete</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Current deal status ·{' '}
          <time dateTime={request.updated_at}>
            {formatTime(request.updated_at)}
          </time>
        </p>
        <ul className="space-y-2">
          {request.items.map((item) => (
            <li key={item.material_id}>
              {item.material_name} · {formatKg(item.offer_weight ?? '0')} at{' '}
              {formatRate(item.offer_price ?? '0')}
            </li>
          ))}
        </ul>
        <p>Total {formatRand(requestTotal(request))}</p>
        <p>
          {user?.id === request.buyer.id || user?.id === request.seller.id
            ? 'The transaction and invoice are in your records.'
            : 'The transaction and invoice are in the trade records.'}
        </p>
        {download.error && (
          <p role="alert" className="text-destructive">
            {download.error.message}
          </p>
        )}
      </CardContent>
      <CardFooter className="flex-wrap gap-3">
        <LinkButton
          to={`${transactionsTo}${transactionsTo.includes('?') ? '&' : '?'}open=${encodeURIComponent(transactionId ?? '')}`}
          variant="outline"
        >
          View transaction
        </LinkButton>
        {transactionId && (
          <Button
            variant="outline"
            disabled={download.isPending}
            onClick={() => download.mutate(transactionId)}
          >
            Download invoice
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
