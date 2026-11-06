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
import { formatKg, formatRand, formatRate, lineCents } from '@/lib/format';
import { requestTotal } from './helpers';

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
  return (
    <Card size="sm" className="max-w-sm">
      <CardHeader className="bg-accent py-3">
        <CardTitle>
          Offer · {request.items.length}{' '}
          {request.items.length === 1 ? 'material' : 'materials'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
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
          Stock is reserved for 48 hours from the offer. An expired offer needs
          to be renewed by the seller.
        </p>
      </CardContent>
      {canRespond && (
        <CardFooter className="gap-3">
          <Button disabled={disabled} onClick={onAccept}>
            Accept
          </Button>
          <Button variant="outline" disabled={disabled} onClick={onDecline}>
            Decline
          </Button>
        </CardFooter>
      )}
    </Card>
  );
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
  return (
    <Card size="sm" className="max-w-sm">
      <CardHeader>
        <CardTitle>Offer accepted</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>Total {formatRand(requestTotal(request))}</p>
        <p>The transaction and invoice are in your records.</p>
        {download.error && (
          <p role="alert" className="text-destructive">
            {download.error.message}
          </p>
        )}
      </CardContent>
      <CardFooter className="flex-wrap gap-3">
        <LinkButton
          to={
            user?.id === request.seller.id
              ? '/transactions/sales'
              : '/transactions/purchases'
          }
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
