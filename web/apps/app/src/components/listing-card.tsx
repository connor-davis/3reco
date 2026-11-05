import { Link } from '@tanstack/react-router';
import { MapPin } from 'lucide-react';
import { VerifiedBadge } from '@/components/badges';
import { MaterialThumb } from '@/components/visuals';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { lowestRate } from '@/lib/data/listings';
import { materialById } from '@/lib/data/materials';
import { storeById } from '@/lib/data/stores';
import { formatKg, formatRate } from '@/lib/format';
import { useStartChat } from '@/lib/mock/use-start-chat';
import { cn } from '@/lib/utils';
import type { Listing } from '@/lib/types';

// The Ask button hides until hover on desktop and is always there on a phone.
const askClass = cn(
  'absolute top-3 right-3 z-10 bg-background text-foreground shadow-md hover:bg-muted',
  'min-[781px]:opacity-0 min-[781px]:transition-opacity',
  'min-[781px]:group-focus-within/card:opacity-100 min-[781px]:group-hover/card:opacity-100'
);

const titleLinkClass = cn(
  'rounded outline-none after:absolute after:inset-0',
  'focus-visible:ring-3 focus-visible:ring-ring/50'
);

/** One listing in the browse grid. The whole title is the link to the lot. */
export function ListingCard({ listing }: { listing: Listing }) {
  const startChat = useStartChat();
  const material = materialById(listing.materialId);
  const store = storeById(listing.storeId);

  // Borderless like design 05: the card frame, ring and fill are switched off.
  return (
    <Card
      className={cn(
        'relative gap-0 overflow-visible bg-transparent py-0 shadow-none ring-0',
        '[--card-spacing:0px]'
      )}
    >
      <div className="relative overflow-hidden rounded-2xl bg-muted">
        <MaterialThumb
          category={material.category}
          className={cn(
            'aspect-[4/3] transition-transform duration-500',
            'group-hover/card:scale-105 motion-reduce:transition-none',
            'motion-reduce:group-hover/card:scale-100'
          )}
        />
        <Badge variant="secondary" className="absolute top-3 left-3">
          {material.tag}
        </Badge>
        <Button
          size="sm"
          className={askClass}
          aria-label={`Ask about ${listing.title}`}
          onClick={() => startChat(listing)}
        >
          Ask
        </Button>
      </div>
      <CardContent className="mt-3.5 space-y-1.5 px-0">
        <h3 className="font-semibold tracking-tight">
          <Link
            to="/market/listing/$listingId"
            params={{ listingId: listing.id }}
            className={titleLinkClass}
          >
            {listing.title}
          </Link>
        </h3>
        <p className="text-sm text-muted-foreground">
          {formatKg(listing.availableKg)} available
        </p>
        <p className="font-semibold tabular-nums">
          <span className="text-xs font-normal text-muted-foreground">
            From{' '}
          </span>
          {formatRate(lowestRate(listing))}
        </p>
        <p className="flex items-center gap-1 text-sm text-muted-foreground">
          <MapPin className="size-4" aria-hidden="true" />
          {store.suburb}, {store.city}
        </p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="truncate font-medium">{store.name}</span>
          <VerifiedBadge verified={store.verified} />
        </div>
      </CardContent>
    </Card>
  );
}
