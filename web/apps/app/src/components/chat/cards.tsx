import { Download, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { LinkButton } from '@/components/link-button';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { materialById } from '@/lib/data/materials';
import { formatKg, formatRand, formatRate, lineCents } from '@/lib/format';
import type { MarketRequest } from '@/lib/types';
import { requestTotal } from './helpers';

type OfferCardProps = {
  request: MarketRequest;
  // Only the buyer can accept or decline the seller's offer.
  canRespond: boolean;
  onAccept: () => void;
  onDecline: () => void;
};

/** The open offer: every line, the total, and the buyer's two answers. */
export function OfferCard({
  request,
  canRespond,
  onAccept,
  onDecline,
}: OfferCardProps) {
  return (
    <Card size="sm" className="max-w-sm gap-0 py-0">
      <CardHeader className="bg-accent py-3">
        <CardTitle>
          Offer ·{' '}
          {request.items.length === 1
            ? '1 line'
            : `${request.items.length} lines`}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 py-4 text-sm">
        <ul className="space-y-2">
          {request.items.map((line) => (
            <li key={line.materialId} className="flex justify-between gap-4">
              <span>
                {materialById(line.materialId).name}
                <span className="block text-xs text-muted-foreground tabular-nums">
                  {formatKg(line.kg)} at {formatRate(line.pricePerKg)}
                </span>
              </span>
              <span className="font-medium tabular-nums">
                {formatRand(lineCents(line.pricePerKg, line.kg))}
              </span>
            </li>
          ))}
        </ul>
        <p className="flex justify-between border-t pt-2 font-semibold tabular-nums">
          <span>Total</span>
          <span>{formatRand(requestTotal(request))}</span>
        </p>
        <p className="text-muted-foreground">{request.collection.window}</p>
      </CardContent>
      {canRespond && (
        <CardFooter className="flex-wrap gap-2 pb-4">
          <Button size="sm" onClick={onAccept}>
            Accept
          </Button>
          <Button size="sm" variant="outline" onClick={onDecline}>
            Decline
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

/** Shown once a deal is accepted. */
export function InvoiceCard({ request }: { request: MarketRequest }) {
  return (
    <Card size="sm" className="max-w-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="size-4" aria-hidden="true" />
          Invoice for {request.id}
        </CardTitle>
      </CardHeader>
      <CardContent className="py-4 text-sm text-muted-foreground">
        Total {formatRand(requestTotal(request))}
      </CardContent>
      <CardFooter className="gap-2 pb-4">
        <LinkButton to="/transactions/purchases" size="sm" variant="outline">
          View
        </LinkButton>
        <Button
          size="sm"
          variant="outline"
          onClick={() => toast('Invoice download is coming soon.')}
        >
          <Download data-icon="inline-start" />
          Download
        </Button>
      </CardFooter>
    </Card>
  );
}
