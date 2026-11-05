import { useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, Leaf, MapPin, PackageSearch } from 'lucide-react';
import { toast } from 'sonner';
import { VerifiedBadge } from '@/components/badges';
import { DataState } from '@/components/data-state';
import { LinkButton } from '@/components/link-button';
import { ListingCard } from '@/components/listing-card';
import { Section } from '@/components/page-header';
import { QuantityStepper } from '@/components/quantity-stepper';
import { PersonAvatar, Stars } from '@/components/visuals';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { rateFor, tierIndexFor } from '@/lib/data/listings';
import { materialById } from '@/lib/data/materials';
import { myStoreId, storeById } from '@/lib/data/stores';
import {
  formatKg,
  formatRand,
  formatRate,
  lineCents,
  toGrams,
} from '@/lib/format';
import { co2For, formatCo2 } from '@/lib/impact';
import { useMock, useMarketListings } from '@/lib/mock/hooks';
import { quantityError } from '@/lib/quantity';
import { useStartChat } from '@/lib/mock/use-start-chat';
import type { Listing } from '@/lib/types';
import { Gallery } from './-components/gallery';
import { PriceBreaks } from './-components/price-breaks';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/market/listing/$listingId')({
  component: ListingPage,
});

function ListingPage() {
  const { listingId } = Route.useParams();
  const listings = useMarketListings();
  const listing = listings.find((item) => item.id === listingId);

  return (
    <>
      <Link
        to="/market"
        className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to browse
      </Link>
      <DataState
        isEmpty={!listing}
        icon={PackageSearch}
        emptyTitle="We can't find that lot"
        emptyText="It may have been sold or taken off the market."
        emptyAction={<LinkButton to="/market">Back to browse</LinkButton>}
        skeleton={<Skeleton className="h-96 w-full rounded-2xl" />}
      >
        {listing && <ListingDetail listing={listing} />}
      </DataState>
    </>
  );
}

/** 500 kg, nudged into what this lot allows. */
function startingKg(listing: Listing): string {
  const low = toGrams(listing.minKg) / 1000;
  const high = toGrams(listing.availableKg) / 1000;

  return String(Math.min(Math.max(500, low), high));
}

function ListingDetail({ listing }: { listing: Listing }) {
  const { role, cart, setCart } = useMock();
  const listings = useMarketListings();
  const startChat = useStartChat();
  const [kg, setKg] = useState(() => startingKg(listing));

  const material = materialById(listing.materialId);
  const store = storeById(listing.storeId);
  const grams = toGrams(kg);
  const problem = quantityError(kg, listing.availableKg);
  const valid = problem === null;

  const rate = rateFor(listing, grams / 1000);
  const tierIndex = tierIndexFor(listing, grams / 1000);
  const own = listing.storeId === myStoreId;
  const related = listings.filter((item) => item.id !== listing.id).slice(0, 3);

  function addToCart() {
    if (role !== 'business') {
      toast('Sign in as a business to use the cart.');
      return;
    }

    const others = cart.filter((line) => line.listingId !== listing.id);
    setCart([...others, { listingId: listing.id, kg }]);
    toast.success('Added to your cart.');
  }

  const actions = (
    <ListingActions
      disabled={!valid}
      onMessage={() => startChat(listing, kg)}
      onAdd={addToCart}
    />
  );

  return (
    <>
      <div className="grid gap-8 lg:grid-cols-2">
        <Gallery category={material.category} />
        <div className="space-y-6">
          <div className="space-y-2">
            <Badge variant="secondary">Available now</Badge>
            <h1 className="text-3xl font-semibold tracking-tight">
              {listing.title}
            </h1>
            <p className="flex items-center gap-1 text-muted-foreground">
              <MapPin className="size-4" aria-hidden="true" />
              {store.suburb}, {store.city}
            </p>
          </div>
          <div>
            <p className="text-3xl font-semibold tabular-nums">
              {formatRate(rate)}
            </p>
            <p className="text-sm text-muted-foreground">
              {formatKg(listing.availableKg)} available
            </p>
            <p className="mt-1 flex items-center gap-1 text-sm">
              <Leaf className="size-4 text-primary" aria-hidden="true" />
              {formatCo2(
                co2For([
                  { materialId: listing.materialId, kg: valid ? kg : '0' },
                ])
              )}{' '}
              saved by this lot
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{material.category}</Badge>
            <Badge variant="outline">{material.tag}</Badge>
            <Badge variant="outline">Collection by arrangement</Badge>
          </div>
          <PriceBreaks listing={listing} activeIndex={tierIndex} />
          <Field data-invalid={!valid}>
            <FieldLabel htmlFor="listing-kg">Quantity (kg)</FieldLabel>
            <QuantityStepper
              id="listing-kg"
              label="quantity in kg"
              value={kg}
              onChange={setKg}
              invalid={!valid}
              errorId="listing-kg-error"
            />
            <FieldDescription>
              Smallest order {formatKg(listing.minKg)}.
            </FieldDescription>
            {problem && (
              <FieldError id="listing-kg-error">{problem}</FieldError>
            )}
          </Field>
          <p className="text-lg">
            Estimated total{' '}
            <strong className="tabular-nums">
              {formatRand(valid ? lineCents(rate, kg) : 0)}
            </strong>
          </p>
          <div className="hidden gap-3 min-[781px]:flex">
            {own ? <OwnLotNote /> : actions}
          </div>
          <SellerStrip storeId={store.id} />
        </div>
      </div>
      <Section
        title="More materials to explore"
        action={
          <LinkButton to="/market" variant="ghost" size="sm">
            View all
          </LinkButton>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {related.map((item) => (
            <ListingCard key={item.id} listing={item} />
          ))}
        </div>
      </Section>
      <div className="h-20 min-[781px]:hidden" aria-hidden="true" />
      <div
        className={cn(
          'fixed inset-x-0 bottom-[calc(3.25rem+env(safe-area-inset-bottom))] z-30',
          'flex gap-3 border-t bg-background p-3 min-[781px]:hidden'
        )}
      >
        {own ? <OwnLotNote /> : actions}
      </div>
    </>
  );
}

/** Your own lot: nothing to buy, so say so instead of showing dead buttons. */
function OwnLotNote() {
  return (
    <p className="text-sm text-muted-foreground">
      This is your own lot. Edit it from Stock.
    </p>
  );
}

type ActionsProps = {
  disabled: boolean;
  onMessage: () => void;
  onAdd: () => void;
};

function ListingActions({ disabled, onMessage, onAdd }: ActionsProps) {
  return (
    <>
      <Button
        className="flex-1"
        size="lg"
        disabled={disabled}
        onClick={onMessage}
      >
        Message seller
      </Button>
      <Button
        className="flex-1"
        size="lg"
        variant="outline"
        disabled={disabled}
        onClick={onAdd}
      >
        Add to cart
      </Button>
    </>
  );
}

function SellerStrip({ storeId }: { storeId: string }) {
  const store = storeById(storeId);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border p-4">
      <PersonAvatar name={store.name} online={store.online} />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium">{store.name}</p>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Stars value={store.rating} />
          {store.rating} / 5 · {store.reviewCount} reviews
        </p>
        <p className="text-sm text-muted-foreground">
          Usually replies in minutes
        </p>
        <VerifiedBadge verified={store.verified} />
      </div>
      <LinkButton
        to="/market/store/$sellerId"
        params={{ sellerId: store.id }}
        variant="outline"
      >
        View store
      </LinkButton>
    </div>
  );
}
