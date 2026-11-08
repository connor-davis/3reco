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
import { DataState } from '@/components/data-state';
import { ChoiceSelect, SearchBox } from '@/components/filters';
import { DecimalField } from '@/components/form-fields';
import { LinkButton } from '@/components/link-button';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import {
  useCart,
  useCartStores,
  useSaveCart,
  useClearCart,
} from '@/lib/api/cart';
import { useStore } from '@/lib/api/stores';
import { useListing } from '@/lib/api/listings';
import { useCreateRequest } from '@/lib/api/requests';
import type { CartItem } from '@/lib/api/types';
import { formatRand, formatRate, lineCents } from '@/lib/format';
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
          <div className="mb-6 space-y-4">
            <SearchBox
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
  items,
  sending,
}: {
  sellerId: string;
  items: CartItem[];
  sending: MutableRefObject<boolean>;
}) {
  const save = useSaveCart(sellerId);
  const cart = useCart(sellerId);
  const clear = useClearCart(sellerId);
  const create = useCreateRequest();
  const navigate = useNavigate();
  // Keep the created request across retries if clearing the cart fails.
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
        sending.current = true;
        await clear.mutateAsync();
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

  return (
    <Card>
      <CardContent>
        <p className="mb-4 text-sm text-muted-foreground">
          Your cart keeps these quantities. Sending your request reserves the
          stock for 48 hours while you agree on the deal.
        </p>
        <form
          id="cart-form"
          className="space-y-6"
          onSubmit={form.handleSubmit(submit)}
          noValidate
        >
          {fields.fields.map((field, index) => (
            <CartLine
              key={field.id}
              stockId={field.stock_id}
              index={index}
              form={form}
              busy={busy}
              onValidation={validateLine}
              onRemove={() => void remove(index)}
            />
          ))}
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          {form.formState.errors.items?.root?.message && (
            <p role="alert" className="text-destructive">
              {form.formState.errors.items.root.message}
            </p>
          )}
        </form>
      </CardContent>
      <CardFooter className="flex-wrap gap-3">
        <p className="mr-auto">
          Estimated total{' '}
          <strong className="tabular-nums">
            {values.some(
              (item) =>
                !!quantityError(item.weight) || !!blockedLines[item.stock_id]
            )
              ? 'Enter valid quantities'
              : formatRand(total)}
          </strong>
        </p>
        <Button
          type="submit"
          form="cart-form"
          disabled={
            busy ||
            values.some(
              (item) =>
                !!quantityError(item.weight) || !!blockedLines[item.stock_id]
            )
          }
        >
          Send request
        </Button>
      </CardFooter>
    </Card>
  );
}

function CartLine({
  stockId,
  index,
  form,
  busy,
  onRemove,
  onValidation,
}: {
  stockId: string;
  index: number;
  form: ReturnType<typeof useForm<CartValues>>;
  busy: boolean;
  onRemove: () => void;
  onValidation: (id: string, problem: string | null) => void;
}) {
  const listing = useListing(stockId);
  const weight = form.watch(`items.${index}.weight`);
  const fieldError = form.formState.errors.items?.[index]?.weight?.message;
  const problem = listing.data
    ? quantityError(weight, listing.data.weight)
    : null;
  const blocked = listing.isFetching
    ? 'Wait for the material availability to load.'
    : listing.isError || !listing.data
      ? 'Remove unavailable materials before sending a request.'
      : problem;
  useEffect(() => {
    onValidation(stockId, blocked);
  }, [stockId, blocked, onValidation]);
  return (
    <div className="space-y-3 border-b pb-4">
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
              className="px-0 text-foreground"
            >
              {listing.data.material_name}
            </LinkButton>
            <p className="text-sm text-muted-foreground">
              {formatRate(listing.data.price)}
            </p>
          </>
        )}
      </DataState>
      <DecimalField
        control={form.control}
        name={`items.${index}.weight`}
        label="Weight (kg)"
        counter={weightCounter(listing.data?.weight)}
      />
      {problem && problem !== fieldError && (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onClick={onRemove}
      >
        Remove material
      </Button>
    </div>
  );
}
