import { useState, type KeyboardEvent } from 'react';
import { MapPin } from 'lucide-react';
import { ListingCard } from '@/components/listing-card';
import { Button } from '@/components/ui/button';
import { storeById } from '@/lib/data/stores';
import { cn } from '@/lib/utils';
import type { Listing } from '@/lib/types';

type Pin = { storeId: string; count: number };

/** One pin per store, so lots from the same yard never sit on top of each other. */
function pinsFor(listings: Listing[]): Pin[] {
  const counts = new Map<string, number>();

  for (const listing of listings) {
    counts.set(listing.storeId, (counts.get(listing.storeId) ?? 0) + 1);
  }

  return [...counts].map(([storeId, count]) => ({ storeId, count }));
}

/**
 * A drawn map of South Africa's trade corridor beside the lots it shows
 * (design 06). Pick a store pin to narrow the list to that store's lots.
 * On a phone the list sits under the map.
 */
export function MarketMap({ listings }: { listings: Listing[] }) {
  const [storeId, setStoreId] = useState<string | null>(null);
  const shown = storeId
    ? listings.filter((listing) => listing.storeId === storeId)
    : listings;

  return (
    <div className="grid gap-6 min-[781px]:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
      <div className="space-y-3 min-[781px]:sticky min-[781px]:top-20 min-[781px]:self-start">
        <MapCanvas
          pins={pinsFor(listings)}
          activeId={storeId}
          onPick={(id) => setStoreId(id === storeId ? null : id)}
        />
        <p className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
          <span className="flex items-center gap-2">
            <MapPin className="size-4" aria-hidden="true" />
            {storeId
              ? `${shown.length} from ${storeById(storeId).name}`
              : 'Pick a pin to see that store’s lots.'}
          </span>
          {storeId && (
            <Button variant="ghost" size="sm" onClick={() => setStoreId(null)}>
              Show all
            </Button>
          )}
        </p>
      </div>
      <div className="grid content-start gap-4 min-[781px]:grid-cols-1 sm:grid-cols-2 xl:grid-cols-2">
        {shown.map((listing) => (
          <ListingCard key={listing.id} listing={listing} />
        ))}
      </div>
    </div>
  );
}

type CanvasProps = {
  pins: Pin[];
  activeId: string | null;
  onPick: (storeId: string) => void;
};

function MapCanvas({ pins, activeId, onPick }: CanvasProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      role="group"
      aria-label="Map of stores with listings"
      className="aspect-square w-full rounded-2xl border bg-map-water"
    >
      <path
        d="M8 18 L40 6 L78 10 L94 32 L90 66 L60 94 L26 92 L6 70 Z"
        className="fill-map-land stroke-border"
        strokeWidth="0.4"
      />
      {pins.map(({ storeId, count }) => (
        <StorePin
          key={storeId}
          storeId={storeId}
          count={count}
          active={storeId === activeId}
          onPick={() => onPick(storeId)}
        />
      ))}
    </svg>
  );
}

type StorePinProps = {
  storeId: string;
  count: number;
  active: boolean;
  onPick: () => void;
};

/** A pin is a real SVG shape placed by geometry, and works with Enter and Space. */
function StorePin({ storeId, count, active, onPick }: StorePinProps) {
  const store = storeById(storeId);
  const lots = count === 1 ? '1 lot' : `${count} lots`;

  function onKeyDown(event: KeyboardEvent<SVGGElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onPick();
    }
  }

  return (
    <g
      transform={`translate(${store.coords.x} ${store.coords.y})`}
      role="button"
      tabIndex={0}
      aria-pressed={active}
      aria-label={`${store.name}, ${store.city}, ${lots}`}
      className="group/pin cursor-pointer outline-none"
      onClick={onPick}
      onKeyDown={onKeyDown}
    >
      {/* A bigger invisible target keeps the pin easy to tap on a phone. */}
      <rect
        x="-11"
        y="-8"
        width="22"
        height="16"
        className="fill-transparent"
      />
      <rect
        x="-9"
        y="-5.5"
        width="18"
        height="11"
        rx="5.5"
        strokeWidth="0.6"
        className={cn(
          'stroke-border group-focus-visible/pin:stroke-ring group-focus-visible/pin:stroke-[1.2]',
          active ? 'fill-primary' : 'fill-card'
        )}
      />
      <text
        textAnchor="middle"
        dominantBaseline="central"
        className={cn(
          'text-[3.2px] font-semibold',
          active ? 'fill-primary-foreground' : 'fill-foreground'
        )}
      >
        {lots}
      </text>
      <text
        y="9.5"
        textAnchor="middle"
        className="fill-foreground text-[2.8px] font-medium"
      >
        {store.city}
      </text>
    </g>
  );
}
