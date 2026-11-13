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

  return (
    <Card className="group/card relative gap-0 bg-transparent py-0 shadow-none ring-0">
      <div className="relative flex overflow-hidden aspect-[4/3] items-center justify-center rounded-lg bg-muted text-muted-foreground">
        {listing.image_url && failedImage !== listing.image_url ? (
          <img
            src={listing.image_url}
            alt={listing.material_name}
            onError={() => setFailedImage(listing.image_url)}
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
      <CardContent className="mt-3.5 space-y-1.5 px-0">
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
