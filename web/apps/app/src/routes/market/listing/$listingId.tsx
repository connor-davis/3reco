import { useEffect, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PackageSearch } from 'lucide-react';
import { toast } from 'sonner';
import { BusinessName } from '@/components/badges';
import { DataState } from '@/components/data-state';
import { ActionBar, ActionBarSpacer } from '@/components/action-bar';
import { Panel } from '@/components/panel';
import { DecimalField } from '@/components/form-fields';
import { LinkButton } from '@/components/link-button';
import { ListingCard } from '@/components/listing-card';
import { Section } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { PersonAvatar, Stars } from '@/components/visuals';
import { NewMessageDialog } from '@/components/dialogs/new-message-dialog';
import { useListing, useListings } from '@/lib/api/listings';
import { useCart, useSaveCart } from '@/lib/api/cart';
import { ApiError } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/use-auth';
import type { Listing } from '@/lib/api/types';
import {
  formatKg,
  formatRate,
  formatRand,
  lineCents,
  plural,
  toGrams,
} from '@/lib/format';
import { quantityError, weightCounter } from '@/lib/quantity';
import { Gallery } from './-components/gallery';

export const Route = createFileRoute('/market/listing/$listingId')({
  component: ListingPage,
});

function ListingPage() {
  const { user } = useAuth();
  const { listingId } = Route.useParams();
  const query = useListing(listingId);
  useEffect(() => {
    if (query.data) document.title = `${query.data.material_name} · 3REco`;
  }, [query.data]);

  return (
    <>
      <LinkButton to="/market" variant="ghost" className="mb-6 px-0">
        Back to browse
      </LinkButton>
      <DataState
        query={query}
        isEmpty={!query.data}
        icon={PackageSearch}
        emptyTitle="We can't find that lot"
        emptyText="It may have been sold or taken off the market."
      >
        {query.data && (
          <>
            <ListingDetail key={query.data.id} listing={query.data} />
            <RelatedListings listing={query.data} />
            {user?.role === 'business' && user.id !== query.data.seller_id && (
              <ActionBarSpacer />
            )}
          </>
        )}
      </DataState>
    </>
  );
}

function RelatedListings({ listing }: { listing: Listing }) {
  const query = useListings({ material_id: listing.material_id, limit: 4 });
  const items =
    query.data?.items.filter((item) => item.id !== listing.id).slice(0, 3) ??
    [];

  return (
    <Section
      title="More materials to explore"
      action={
        <LinkButton to="/market" variant="ghost">
          View all
        </LinkButton>
      }
    >
      <DataState
        query={query}
        isEmpty={!items.length}
        icon={PackageSearch}
        emptyTitle="No similar materials listed"
        emptyText="Browse the marketplace for more materials."
      >
        <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:gap-4 xl:grid-cols-3 2xl:grid-cols-4">
          {items.map((item) => (
            <ListingCard key={item.id} listing={item} />
          ))}
        </div>
      </DataState>
    </Section>
  );
}

function ListingDetail({ listing }: { listing: Listing }) {
  const { user } = useAuth();
  const own = listing.seller_id === user?.id;
  const cart = useCart(
    user?.role === 'business' && !own ? listing.seller_id : ''
  );
  const save = useSaveCart(listing.seller_id);
  const [chatOpen, setChatOpen] = useState(false);
  const schema = z.object({
    weight: z.string().superRefine((value, ctx) => {
      // An empty field has no error to explain yet; the cart action stays disabled.
      if (!value.trim()) return;
      const message = quantityError(value, listing.weight);
      if (message) ctx.addIssue({ code: 'custom', message });
    }),
  });
  const form = useForm({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: { weight: '' },
  });
  const weight = form.watch('weight');
  const problem = quantityError(weight, listing.weight);
  const orderDisabled = save.isPending || cart.isFetching || !!problem;

  async function add(values: { weight: string }) {
    if (!cart.data) return;
    try {
      const items = cart.data.items
        .filter((item) => item.stock_id !== listing.id)
        .map((item) => ({
          stock_id: item.stock_id,
          material_id: item.material_id,
          weight: item.weight ?? '',
        }));
      await save.mutateAsync({
        items: [
          ...items,
          {
            stock_id: listing.id,
            material_id: listing.material_id,
            weight: values.weight.trim().replace(',', '.'),
          },
        ],
      });
      toast.success('Added to your cart.', { id: 'cart-saved' });
    } catch (error) {
      // The server says how much is left in the field message.
      form.setError('root', {
        message:
          error instanceof ApiError && error.fields?.items
            ? error.fields.items
            : error instanceof Error
              ? error.message
              : 'Could not save your cart.',
      });
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <NewMessageDialog
        open={chatOpen}
        onOpenChange={setChatOpen}
        listing={listing}
        initialWeight={problem ? '' : weight}
      />
      <Gallery image={listing.image_url} name={listing.material_name} />
      <Panel title="Material details">
        <div className="space-y-4">
          <h1 className="text-3xl font-semibold tracking-tight">
            {listing.material_name}
          </h1>
          <p className="text-3xl font-semibold tabular-nums">
            {formatRate(listing.price)}
          </p>
          <p className="text-muted-foreground">
            {toGrams(listing.weight) === 0
              ? 'Fully reserved'
              : `${formatKg(listing.weight)} available`}
          </p>
          {own && listing.gw_code && (
            <p className="text-sm text-muted-foreground">
              Material code: {listing.gw_code}
            </p>
          )}
          <form
            onSubmit={form.handleSubmit(add)}
            className="space-y-4"
            noValidate
          >
            {!own && (
              <>
                <DecimalField
                  control={form.control}
                  name="weight"
                  label="Quantity (kg)"
                  counter={weightCounter(listing.weight)}
                  description={
                    user?.role === 'business'
                      ? 'Your cart keeps this quantity. You can change it before sending your request.'
                      : undefined
                  }
                />
                {weight.trim() && problem && !form.formState.errors.weight && (
                  <p role="alert" className="text-sm text-destructive">
                    {problem}
                  </p>
                )}
              </>
            )}
            {user?.role === 'business' && !own ? (
              <DataState
                query={cart}
                icon={PackageSearch}
                emptyTitle="Your cart"
                emptyText="Add this material to your cart."
              >
                <ActionBar
                  label={
                    <>
                      <p>
                        Estimated total{' '}
                        <strong className="tabular-nums">
                          {problem
                            ? '-'
                            : formatRand(lineCents(listing.price, weight))}
                        </strong>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Adding to your cart holds it for 48 hours.
                      </p>
                    </>
                  }
                >
                  <Button
                    type="button"
                    disabled={orderDisabled}
                    onClick={() => setChatOpen(true)}
                  >
                    Request this material
                  </Button>
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={orderDisabled}
                  >
                    Add to cart
                  </Button>
                </ActionBar>
              </DataState>
            ) : (
              <p className="text-sm text-muted-foreground">
                {own
                  ? 'This is your own lot. Edit it from Stock.'
                  : user
                    ? user.role === 'admin' || user.role === 'staff'
                      ? 'You can browse listings, but staff and administrators cannot request materials.'
                      : 'Only business accounts can request materials and use the cart.'
                    : 'Sign in as a business to request materials and use the cart.'}
              </p>
            )}
            {form.formState.errors.root?.message && (
              <p role="alert" className="text-sm text-destructive">
                {form.formState.errors.root?.message}
              </p>
            )}
          </form>
          <div className="flex flex-wrap items-center gap-3 border-t pt-4">
            <PersonAvatar
              name={listing.seller_name}
              image={listing.seller_avatar_url}
            />
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                <BusinessName
                  name={listing.seller_name}
                  verified={listing.seller_verified}
                />
              </p>
              {listing.average_rating !== null && (
                <Stars value={listing.average_rating} />
              )}
              <p className="text-sm text-muted-foreground">
                {plural(listing.review_count, 'review')}
              </p>
            </div>
            <Link
              className="inline-flex min-h-11 items-center rounded px-3 hover:underline focus-visible:ring-3 focus-visible:ring-ring"
              to="/market/store/$sellerId"
              params={{ sellerId: listing.seller_id }}
            >
              View store
            </Link>
          </div>
        </div>
      </Panel>
    </div>
  );
}
