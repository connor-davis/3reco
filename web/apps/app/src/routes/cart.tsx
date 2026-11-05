import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ShoppingCart, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Guarded } from '@/components/access-guard';
import { VerifiedBadge } from '@/components/badges';
import { DataState } from '@/components/data-state';
import { IconButton } from '@/components/icon-button';
import { LinkButton } from '@/components/link-button';
import { PageHeader } from '@/components/page-header';
import { QuantityStepper } from '@/components/quantity-stepper';
import { MaterialThumb, PersonAvatar } from '@/components/visuals';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Field, FieldError } from '@/components/ui/field';
import { Separator } from '@/components/ui/separator';
import { rateFor } from '@/lib/data/listings';
import { materialById } from '@/lib/data/materials';
import { myStoreId, storeById } from '@/lib/data/stores';
import {
  formatKg,
  formatRand,
  formatRate,
  lineCents,
  toGrams,
} from '@/lib/format';
import { cn } from '@/lib/utils';
import { useMock, useMockList, useMarketListings } from '@/lib/mock/hooks';
import { quantityError } from '@/lib/quantity';
import type { Listing, MarketRequest } from '@/lib/types';

export const Route = createFileRoute('/cart')({
  component: () => (
    <Guarded page="cart">
      <CartPage />
    </Guarded>
  ),
});

type Row = {
  listing: Listing;
  kg: string;
  rate: string;
  cents: number;
  // Why this line cannot be sent yet, or null when it is fine.
  error: string | null;
};

function CartPage() {
  const { cart, setCart } = useMock();
  const listings = useMarketListings();
  const requests = useMockList('requests');
  const navigate = useNavigate();

  const rows: Row[] = cart.flatMap((line) => {
    const listing = listings.find((item) => item.id === line.listingId);
    if (!listing) return [];

    const rate = rateFor(listing, toGrams(line.kg) / 1000);
    const error = quantityError(line.kg, listing.availableKg);

    return [
      {
        listing,
        kg: line.kg,
        rate,
        cents: error ? 0 : lineCents(rate, line.kg),
        error,
      },
    ];
  });

  const storeIds = [...new Set(rows.map((row) => row.listing.storeId))];
  const total = rows.reduce((sum, row) => sum + row.cents, 0);
  const sendable = storeIds.filter((id) =>
    rows.every((row) => row.listing.storeId !== id || !row.error)
  );

  function setKg(listingId: string, kg: string) {
    setCart(
      cart.map((line) =>
        line.listingId === listingId ? { ...line, kg } : line
      )
    );
  }

  function remove(listingId: string) {
    setCart(cart.filter((line) => line.listingId !== listingId));
    toast.success('Removed from your cart.');
  }

  function create(storeId: string, offset: number): MarketRequest {
    const items = rows.filter((row) => row.listing.storeId === storeId);
    const created: MarketRequest = {
      id: `REQ-${1100 + requests.items.length + offset}`,
      buyerId: myStoreId,
      sellerId: storeId,
      status: 'Requested',
      createdAt: new Date().toISOString(),
      items: items.map((row) => ({
        materialId: row.listing.materialId,
        kg: row.kg,
        pricePerKg: row.rate,
      })),
      collection: { area: storeById(storeId).suburb, window: 'To be agreed' },
      offerPending: false,
      unread: 0,
      preview: 'You sent a request.',
      lastAt: 'Now',
    };

    requests.add(created);

    return created;
  }

  function clearSent(storeIds: string[]) {
    setCart(
      cart.filter((line) => {
        const row = rows.find((item) => item.listing.id === line.listingId);

        return !row || !storeIds.includes(row.listing.storeId);
      })
    );
  }

  function send(storeId: string) {
    const created = create(storeId, 0);

    clearSent([storeId]);
    toast.success('Request sent.');
    navigate({ to: '/messages/$requestId', params: { requestId: created.id } });
  }

  function sendAll() {
    sendable.forEach((storeId, index) => create(storeId, index));
    clearSent(sendable);
    toast.success(
      sendable.length === 1
        ? 'Request sent.'
        : `${sendable.length} requests sent.`
    );
    navigate({ to: '/messages' });
  }

  return (
    <>
      <PageHeader
        title="Your cart"
        description="Group your materials by seller, then send one request per store."
        actions={
          <LinkButton to="/market" variant="outline">
            Keep browsing
          </LinkButton>
        }
      />
      <DataState
        isEmpty={rows.length === 0}
        icon={ShoppingCart}
        emptyTitle="Your next deal starts here."
        emptyText="Add materials from a listing and they will wait for you here."
        emptyAction={<LinkButton to="/market">Browse materials</LinkButton>}
      >
        <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-6">
            {storeIds.map((storeId) => (
              <StorePanel
                key={storeId}
                storeId={storeId}
                rows={rows.filter((row) => row.listing.storeId === storeId)}
                onKg={setKg}
                onRemove={remove}
                onSend={() => send(storeId)}
              />
            ))}
          </div>
          <Summary rows={rows} stores={storeIds.length} total={total} />
        </div>
        <div className="h-20 min-[781px]:hidden" aria-hidden="true" />
        <div
          className={cn(
            'fixed inset-x-0 bottom-[calc(3.25rem+env(safe-area-inset-bottom))] z-30 flex items-center',
            'justify-between gap-3 border-t bg-background p-3 min-[781px]:hidden'
          )}
        >
          <p className="text-sm">
            Total{' '}
            <strong className="block text-base tabular-nums">
              {formatRand(total)}
            </strong>
          </p>
          <Button size="lg" disabled={sendable.length === 0} onClick={sendAll}>
            Send {sendable.length > 1 ? 'all requests' : 'request'}
          </Button>
        </div>
      </DataState>
    </>
  );
}

type PanelProps = {
  storeId: string;
  rows: Row[];
  onKg: (listingId: string, kg: string) => void;
  onRemove: (listingId: string) => void;
  onSend: () => void;
};

function StorePanel({ storeId, rows, onKg, onRemove, onSend }: PanelProps) {
  const store = storeById(storeId);
  const subtotal = rows.reduce((sum, row) => sum + row.cents, 0);

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3">
        <PersonAvatar name={store.name} online={store.online} />
        <div className="min-w-0 flex-1 space-y-1">
          <CardTitle>{store.name}</CardTitle>
          <p className="text-sm text-muted-foreground">
            Collection from {store.suburb}
          </p>
        </div>
        <VerifiedBadge verified={store.verified} />
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.map((row, index) => (
          <div key={row.listing.id}>
            {index > 0 && <Separator className="mb-4" />}
            <CartLine row={row} onKg={onKg} onRemove={onRemove} />
          </div>
        ))}
      </CardContent>
      <CardFooter className="justify-between gap-3">
        <p>
          Subtotal{' '}
          <strong className="tabular-nums">{formatRand(subtotal)}</strong>
        </p>
        <Button disabled={rows.some((row) => row.error)} onClick={onSend}>
          Send request
        </Button>
      </CardFooter>
    </Card>
  );
}

type LineProps = {
  row: Row;
  onKg: (listingId: string, kg: string) => void;
  onRemove: (listingId: string) => void;
};

function CartLine({ row, onKg, onRemove }: LineProps) {
  const material = materialById(row.listing.materialId);
  const errorId = `cart-${row.listing.id}-error`;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <MaterialThumb
        category={material.category}
        className="size-16 rounded-xl"
      />
      <div className="min-w-40 flex-1">
        <Link
          to="/market/listing/$listingId"
          params={{ listingId: row.listing.id }}
          className="font-medium hover:underline"
        >
          {row.listing.title}
        </Link>
        <p className="text-sm text-muted-foreground">{formatRate(row.rate)}</p>
      </div>
      <Field className="w-44" data-invalid={Boolean(row.error)}>
        <QuantityStepper
          label={`${row.listing.title} in kg`}
          value={row.kg}
          onChange={(kg) => onKg(row.listing.id, kg)}
          invalid={Boolean(row.error)}
          errorId={errorId}
        />
      </Field>
      <p className="w-24 text-right font-medium tabular-nums">
        {formatRand(row.cents)}
      </p>
      <IconButton
        label={`Remove ${row.listing.title}`}
        onClick={() => onRemove(row.listing.id)}
      >
        <Trash2 />
      </IconButton>
      {row.error && (
        <FieldError id={errorId} className="basis-full">
          {row.error}
        </FieldError>
      )}
    </div>
  );
}

function Summary({
  rows,
  stores,
  total,
}: {
  rows: Row[];
  stores: number;
  total: number;
}) {
  return (
    <aside className="lg:sticky lg:top-20 lg:self-start">
      <Card>
        <CardHeader>
          <CardTitle>Your request summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {rows.map((row) => (
            <p key={row.listing.id} className="flex justify-between gap-2">
              <span>{materialById(row.listing.materialId).name}</span>
              <span className="tabular-nums">{formatKg(row.kg)}</span>
            </p>
          ))}
          <Separator />
          <p className="flex justify-between">
            <span>Stores</span>
            <span>{stores}</span>
          </p>
          <p className="flex justify-between text-base font-semibold">
            <span>Estimated total</span>
            <span className="tabular-nums">{formatRand(total)}</span>
          </p>
          <p className="text-muted-foreground">
            Sending a request starts a conversation. Nothing is paid until you
            both agree.
          </p>
        </CardContent>
        <CardFooter>
          <LinkButton to="/messages" variant="outline" className="w-full">
            Open messages
          </LinkButton>
        </CardFooter>
      </Card>
    </aside>
  );
}
