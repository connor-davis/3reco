import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Package } from 'lucide-react';
import { BusinessName } from '@/components/badges';
import { PersonAvatar } from '@/components/visuals';
import { Card, CardContent } from '@/components/ui/card';
import { formatKg, formatRate, toGrams } from '@/lib/format';
import type { Listing } from '@/lib/api/types';

/** `showSeller` is off on the seller's own store page, where it is redundant. */
export function ListingCard({
  listing,
  showSeller = true,
}: {
  listing: Listing;
  showSeller?: boolean;
}) {
  const [failedImage, setFailedImage] = useState<string>();
  // The small copy loads fast on a phone; old photos without one still answer
  // this URL with the full image.
  const cardImage = listing.thumb_url || listing.image_url;

  return (
    <Card className="group/card relative flex flex-col gap-0 overflow-hidden rounded-2xl border bg-card py-0 shadow-[var(--shadow)] ring-0 dark:shadow-none">
      <div className="relative flex overflow-hidden aspect-[4/3] items-center justify-center rounded-none bg-muted text-muted-foreground">
        {cardImage && failedImage !== cardImage ? (
          <img
            src={cardImage}
            alt={listing.material_name}
            loading="lazy"
            decoding="async"
            width={400}
            height={300}
            onError={() => setFailedImage(cardImage)}
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <Package
            className="size-10 sm:size-16"
            strokeWidth={1.25}
            aria-hidden="true"
          />
        )}
      </div>
      <CardContent className="space-y-1.5 p-4">
        <h3 className="line-clamp-2 font-semibold tracking-tight">
          <Link
            className="rounded outline-none after:absolute after:inset-0 hover:underline focus-visible:after:rounded-lg focus-visible:after:ring-3 focus-visible:after:ring-ring focus-visible:after:ring-inset"
            to="/market/listing/$listingId"
            params={{ listingId: listing.id }}
          >
            {listing.material_name}
          </Link>
        </h3>
        <p className="text-sm text-muted-foreground">
          {toGrams(listing.weight) === 0
            ? 'Fully reserved'
            : `${formatKg(listing.weight)} available`}
        </p>
        <p className="font-semibold tabular-nums">
          {formatRate(listing.price)}
        </p>
        {showSeller && (
          <Link
            className="relative z-10 inline-flex min-h-11 max-w-full items-center gap-2 text-sm hover:underline"
            to="/market/store/$sellerId"
            params={{ sellerId: listing.seller_id }}
          >
            <PersonAvatar
              name={listing.seller_name}
              image={listing.seller_avatar_url}
            />
            <BusinessName
              name={listing.seller_name}
              verified={listing.seller_verified}
            />
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
