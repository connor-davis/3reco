import { Link } from '@tanstack/react-router';
import { Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatKg, formatRate } from '@/lib/format';
import type { Listing } from '@/lib/api/types';
import { useStartChat } from './chat/use-request-actions';

export function ListingCard({ listing }: { listing: Listing }) {
  const chat = useStartChat();

  return (
    <Card className="group/card relative gap-0 bg-transparent py-0 shadow-none ring-0">
      <div className="relative flex aspect-[4/3] items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Package className="size-16" strokeWidth={1.25} aria-hidden="true" />
        <Button
          className="absolute top-3 right-3 z-10 min-h-11"
          variant="secondary"
          disabled={chat.isPending}
          onClick={() => void chat.startChat(listing)}
          aria-label={`Ask about ${listing.material_name}`}
        >
          Ask
        </Button>
      </div>
      <CardContent className="mt-3.5 space-y-1.5 px-0">
        <h3 className="font-semibold tracking-tight">
          <Link
            className="rounded outline-none after:absolute after:inset-0 hover:underline focus-visible:after:rounded-2xl focus-visible:after:ring-3 focus-visible:after:ring-ring focus-visible:after:ring-inset"
            to="/market/listing/$listingId"
            params={{ listingId: listing.id }}
          >
            {listing.material_name}
          </Link>
        </h3>
        <p className="text-sm text-muted-foreground">
          {formatKg(listing.weight)} available
        </p>
        <p className="font-semibold tabular-nums">
          {formatRate(listing.price)}
        </p>
        <Link
          className="relative z-10 inline-flex min-h-11 items-center text-sm hover:underline"
          to="/market/store/$sellerId"
          params={{ sellerId: listing.seller_id }}
        >
          {listing.seller_name}
        </Link>
        {chat.error && (
          <p role="alert" className="text-sm text-destructive">
            {chat.error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
