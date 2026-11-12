import { toast } from 'sonner';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ShoppingCart, Store as StoreIcon } from 'lucide-react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Guarded } from '@/components/access-guard';
import { BusinessName } from '@/components/badges';
import { ActionBar, ActionBarSpacer } from '@/components/action-bar';
import { DataState } from '@/components/data-state';
import { ChoiceSelect, SearchBox } from '@/components/filters';
import { DecimalField } from '@/components/form-fields';
import { LinkButton } from '@/components/link-button';
import { PageHeader } from '@/components/page-header';
import { Panel } from '@/components/panel';
import { Button } from '@/components/ui/button';
import { useCart, useCartStores, useSaveCart } from '@/lib/api/cart';
import { useStore } from '@/lib/api/stores';
import { useListing } from '@/lib/api/listings';
import { useCreateRequest } from '@/lib/api/requests';
import type { CartItem } from '@/lib/api/types';
import {
  formatDateTime,
  formatRand,
  formatRate,
  lineCents,
  toGrams,
} from '@/lib/format';
import { quantityError, weightCounter } from '@/lib/quantity';

export const Route = createFileRoute('/cart')({
  validateSearch: (search: Record<string, unknown>) => ({
    ...(typeof search.seller_id === 'string' && search.seller_id
      ? { seller_id: search.seller_id }
      : {}),
  }),
  component: () => (
    <Guarded page="cart">
      <CartPage />
    </Guarded>
  ),
});

function CartPage() {
  const { seller_id: selectedSeller } = Route.useSearch();
  const navigate = useNavigate();
  useEffect(() => {
    toast.dismiss('cart-saved');
  }, []);
  const [search, setSearch] = useState('');
  const stores = useCartStores();
  const sellerId = selectedSeller ?? stores.data?.items[0]?.id ?? '';
  const selectedCart = useCart(sellerId);
  // Set while a sent request empties the cart, so we don't bounce to /cart.
  const sending = useRef(false);
  useEffect(() => {
    if (
      selectedSeller &&
      !sending.current &&
      selectedCart.isSuccess &&
      !selectedCart.isFetching &&
      selectedCart.data.items.length === 0
    ) {
      void navigate({ to: '/cart', search: {}, replace: true });
    }
  }, [
    selectedSeller,
    selectedCart.isSuccess,
    selectedCart.isFetching,
    selectedCart.data,
    navigate,
  ]);

  const options =
    stores.data?.items
      .filter((store) =>
        store.name.toLowerCase().includes(search.toLowerCase())
      )
      .map((store) => ({
        value: store.id,
        label: store.name,
        verified: store.business_verified,
      })) ?? [];

  return (
    <>
      <PageHeader
        title="Your cart"
        description={
          sellerId
            ? selectedCart.isPending
              ? 'Loading your saved cart.'
              : selectedCart.isError
                ? 'Your saved cart could not load. Try again.'
                : selectedCart.data?.items.length
                  ? 'Review quantities before sending your request.'
                  : 'Add materials from a listing to start a request.'
            : stores.isPending
              ? 'Loading your saved carts.'
              : stores.data?.items.length === 0
                ? 'Browse materials to start a request.'
                : 'Choose a store to open its saved cart.'
        }
      />
      {!stores.data?.items.length && !stores.isPending && !selectedSeller ? (
        <DataState
          isEmpty
          icon={ShoppingCart}
          emptyTitle="Your cart is empty"
          emptyText="Browse materials to add some."
          emptyAction={<LinkButton to="/market">Browse materials</LinkButton>}
        >
          <span />
        </DataState>
      ) : (
        <>
          <div className="mb-4 flex items-center gap-2">
            <SearchBox
              className="min-w-0 flex-1"
              label="Find a store"
              value={search}
              onChange={(value) => {
                setSearch(value);
              }}
            />
            <DataState
              query={stores}
              isEmpty={!options.length}
              icon={StoreIcon}
              emptyTitle="No stores found"
              emptyText="Try another search."
            >
              <ChoiceSelect
                className="w-40 shrink-0 sm:w-56"
                label="Store cart"
                value={sellerId}
                options={options}
                onChange={(value) =>
                  void navigate({ to: '/cart', search: { seller_id: value } })
                }
              />
            </DataState>
          </div>
          {sellerId ? (
            <SellerCart key={sellerId} sellerId={sellerId} sending={sending} />
          ) : (
            <DataState
              isEmpty
              icon={ShoppingCart}
              emptyTitle="Choose a store"
              emptyText="Your materials are saved separately for each store."
            >
              <span />
            </DataState>
          )}
        </>
      )}
    </>
  );
}

function SellerCart({
  sellerId,
  sending,
}: {
  sellerId: string;
  sending: MutableRefObject<boolean>;
}) {
  const cart = useCart(sellerId);
  const store = useStore(sellerId);
  return (
    <DataState
      query={[cart, store]}
      isEmpty={!cart.data?.items.length}
      icon={ShoppingCart}
      emptyTitle="This cart is empty"
      emptyText="Add materials from a listing to start a request."
      emptyAction={<LinkButton to="/market">Browse materials</LinkButton>}
    >
      {cart.data && (
        <CartForm
          sellerId={sellerId}
          storeName={store.data?.name}
          storeVerified={store.data?.business_verified}
          items={cart.data.items}
          sending={sending}
        />
      )}
    </DataState>
  );
}

function createCartSchema() {
  return z.object({
    items: z
      .array(
        z.object({
          stock_id: z.string(),
          material_id: z.string(),
          weight: z.string().superRefine((value, ctx) => {
            const message = quantityError(value);
            if (message) ctx.addIssue({ code: 'custom', message });
          }),
        })
      )
      .min(1, 'Add a material first.')
      .max(50, 'Send at most 50 materials in one request.'),
  });
}
type CartValues = z.infer<ReturnType<typeof createCartSchema>>;

function CartForm({
  sellerId,
  storeName,
  storeVerified,
  items,
  sending,
}: {
  sellerId: string;
  storeName?: string;
  storeVerified?: boolean;
  items: CartItem[];
  sending: MutableRefObject<boolean>;
}) {
  const save = useSaveCart(sellerId);
  const cart = useCart(sellerId);
  const create = useCreateRequest();
  const navigate = useNavigate();
  // Keep the created request across retries if opening its chat fails.
  const sent = useRef<string | null>(null);
  const availability = useRef(new Map<string, string | null>());
  const validateLine = useCallback((id: string, problem: string | null) => {
    availability.current.set(id, problem);
    setBlockedLines((current) =>
      current[id] === problem ? current : { ...current, [id]: problem }
    );
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [blockedLines, setBlockedLines] = useState<
    Record<string, string | null>
  >({});
  const form = useForm<CartValues>({
    resolver: zodResolver(createCartSchema()),
    defaultValues: {
      items: items.map((item) => ({
        stock_id: item.stock_id,
        material_id: item.material_id,
        weight: item.weight ?? '',
      })),
    },
  });
  const fields = useFieldArray({ control: form.control, name: 'items' });
  const { reset } = form;
  useEffect(() => {
    reset({
      items: items.map((item) => ({
        stock_id: item.stock_id,
        material_id: item.material_id,
        weight: item.weight ?? '',
      })),
    });
  }, [items, reset]);
  const values = form.watch('items');
  const total = values.reduce(
    (sum, item) =>
      sum +
      lineCents(
        items.find((line) => line.stock_id === item.stock_id)?.price ?? '0',
        item.weight
      ),
    0
  );

  async function submit(values: CartValues) {
    const problem = values.items
      .map(
        (item) =>
          availability.current.get(item.stock_id) ??
          (availability.current.has(item.stock_id)
            ? null
            : 'Wait for the materials to load.')
      )
      .find(Boolean);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    // The server empties the cart when it creates the request. Say so before
    // the cart refetches, so the page does not bounce back to /cart.
    sending.current = true;
    try {
      const clean = values.items.map((item) => ({
        ...item,
        weight: item.weight.trim().replace(',', '.'),
      }));
      if (!sent.current) {
        sent.current = (
          await create.mutateAsync({
            seller_id: sellerId,
            from_cart: true,
            items: clean.map(({ material_id, stock_id, weight }) => ({
              material_id,
              stock_id,
              weight,
            })),
          })
        ).id;
      }
      if (sent.current) {
        const id = sent.current;
        await navigate({
          to: '/messages/$requestId',
          params: { requestId: id },
        });
        toast.success('Request sent. Stock is reserved for 48 hours.');
      }
    } catch (cause) {
      sending.current = false;
      setError(
        cause instanceof Error ? cause.message : 'Could not update your cart.'
      );
      if (
        cause instanceof Error &&
        cause.message === 'Your cart changed. Check it and send again.'
      ) {
        await cart.refetch();
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(index: number) {
    setBusy(true);
    setError(null);
    try {
      const removedId = values[index].stock_id;
      const next = items.filter((item) => item.stock_id !== removedId);
      await save.mutateAsync({
        items: next.map((item) => ({
          ...item,
          weight: (item.weight ?? '').trim().replace(',', '.'),
        })),
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not remove this material.'
      );
    } finally {
      setBusy(false);
    }
  }

  const invalid = values.some(
    (item) => !!quantityError(item.weight) || !!blockedLines[item.stock_id]
  );
  const totalText = invalid ? 'Enter valid quantities' : formatRand(total);

  return (
    <>
      <Panel
        title={
          <BusinessName name={storeName ?? 'Store'} verified={storeVerified} />
        }
        action={
          <LinkButton
            to="/market/store/$sellerId"
            params={{ sellerId }}
            variant="link"
            className="min-h-11 shrink-0 px-0"
          >
            View store
          </LinkButton>
        }
      >
        <p className="mb-2 text-xs text-muted-foreground">
          Your cart holds these quantities for 48 hours. After that they leave
          your cart. Sending your request keeps them reserved while you agree on
          the deal.
        </p>
        <form id="cart-form" onSubmit={form.handleSubmit(submit)} noValidate>
          {fields.fields.map((field, index) => (
            <CartLine
              key={field.id}
              stockId={field.stock_id}
              saved={items.find((item) => item.stock_id === field.stock_id)}
              index={index}
              form={form}
              busy={busy}
              onValidation={validateLine}
              onRemove={() => void remove(index)}
            />
          ))}
          {error && (
            <p role="alert" className="pt-3 text-destructive">
              {error}
            </p>
          )}
          {form.formState.errors.items?.root?.message && (
            <p role="alert" className="pt-3 text-destructive">
              {form.formState.errors.items.root.message}
            </p>
          )}
        </form>
        <p className="flex justify-between gap-3 border-t pt-3 text-sm">
          <span className="text-muted-foreground">Store subtotal</span>
          <span className="tabular-nums">
            {invalid ? '-' : formatRand(total)}
          </span>
        </p>
        {/* Phone and tablet: pinned above the bottom tabs. Laptop: card end. */}
        <ActionBar
          data-testid="cart-action-bar"
          className="lg:mt-4"
          label={
            <p className="mr-auto min-w-0 text-sm">
              Estimated total
              <strong className="block text-base tabular-nums">
                {totalText}
              </strong>
            </p>
          }
        >
          <Button
            type="submit"
            form="cart-form"
            className="min-h-11"
            disabled={busy || invalid}
          >
            Send request
          </Button>
        </ActionBar>
      </Panel>
      <ActionBarSpacer />
    </>
  );
}

function CartLine({
  stockId,
  saved,
  index,
  form,
  busy,
  onRemove,
  onValidation,
}: {
  stockId: string;
  saved?: CartItem;
  index: number;
  form: ReturnType<typeof useForm<CartValues>>;
  busy: boolean;
  onRemove: () => void;
  onValidation: (id: string, problem: string | null) => void;
}) {
  const listing = useListing(stockId);
  const weight = form.watch(`items.${index}.weight`);
  const fieldError = form.formState.errors.items?.[index]?.weight?.message;
  // The listing's free stock already excludes this line's own hold, so the
  // buyer may keep or raise the line up to free stock plus what they hold.
  const reservedGrams = saved?.reserved_until
    ? toGrams(saved.weight ?? '0')
    : 0;
  const available = listing.data
    ? ((toGrams(listing.data.weight) + reservedGrams) / 1000).toFixed(3)
    : undefined;
  const problem = available ? quantityError(weight, available) : null;
  const blocked = listing.isFetching
    ? 'Wait for the material availability to load.'
    : listing.isError || !listing.data
      ? 'Remove unavailable materials before sending a request.'
      : problem;
  useEffect(() => {
    onValidation(stockId, blocked);
  }, [stockId, blocked, onValidation]);
  return (
    <div className="flex flex-col gap-2 border-t py-3 first:border-t-0 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-0.5">
        <DataState
          query={listing}
          icon={ShoppingCart}
          emptyTitle="Material unavailable"
          emptyText="Remove this material to continue."
        >
          {listing.data && (
            <>
              <LinkButton
                to="/market/listing/$listingId"
                params={{ listingId: stockId }}
                variant="link"
                // Phones keep the 44px tap area; the negative margin stops it
                // pushing the price away.
                className="h-auto min-h-0 px-0 py-0 text-foreground max-lg:-my-2.5"
              >
                {listing.data.material_name}
              </LinkButton>
              <p className="text-sm text-muted-foreground">
                {formatRate(listing.data.price)}
              </p>
              {saved?.reserved_until && (
                <p className="text-xs text-muted-foreground">
                  Reserved until {formatDateTime(saved.reserved_until)}
                </p>
              )}
            </>
          )}
        </DataState>
      </div>
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1 sm:w-44 sm:flex-none">
          <DecimalField
            control={form.control}
            name={`items.${index}.weight`}
            label="Weight (kg)"
            counter={weightCounter(available)}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          aria-label={`Remove ${listing.data?.material_name ?? 'material'}`}
          disabled={busy}
          onClick={onRemove}
        >
          Remove
        </Button>
      </div>
      {problem && problem !== fieldError && (
        <p role="alert" className="text-sm text-destructive sm:basis-full">
          {problem}
        </p>
      )}
    </div>
  );
}
