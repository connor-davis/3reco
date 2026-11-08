import { toast } from 'sonner';
import { useNavigate } from '@tanstack/react-router';
import { useCreateRequest } from '@/lib/api/requests';
import type { Listing } from '@/lib/api/types';
import { quantityError, weightCounter } from '@/lib/quantity';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PackageSearch } from 'lucide-react';
import { DataState } from '@/components/data-state';
import { SearchBox } from '@/components/filters';
import { SelectField, DecimalField } from '@/components/form-fields';
import { ResponsiveOverlay } from '@/components/responsive-overlay';
import { Button } from '@/components/ui/button';
import { useListings } from '@/lib/api/listings';

const schema = z.object({
  listingId: z.string().min(1, 'Choose a material to ask about.'),
  weight: z.string().superRefine((value, ctx) => {
    const message = quantityError(value);
    if (message) ctx.addIssue({ code: 'custom', message });
  }),
});

export function NewMessageDialog({
  open,
  onOpenChange,
  listing,
  initialWeight = '',
}: {
  listing?: Listing;
  initialWeight?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={onOpenChange}
      title="Start a conversation"
      description="Choose a quantity to send a request. Sending it reserves that weight for 48 hours."
    >
      {open && (
        <NewMessageForm
          listing={listing}
          initialWeight={initialWeight}
          onDone={() => onOpenChange(false)}
        />
      )}
    </ResponsiveOverlay>
  );
}

function NewMessageForm({
  onDone,
  listing,
  initialWeight = '',
}: {
  onDone: () => void;
  listing?: Listing;
  initialWeight: string;
}) {
  const [search, setSearch] = useState('');
  const [cursor, setCursor] = useState<string>();
  const query = useListings({ q: search, cursor }, !listing);
  const create = useCreateRequest();
  const navigate = useNavigate();
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { listingId: listing?.id ?? '', weight: initialWeight },
  });

  const selected =
    listing ??
    query.data?.items.find((item) => item.id === form.watch('listingId'));
  const problem = quantityError(form.watch('weight'), selected?.weight);
  const showProblem =
    form.formState.touchedFields.weight || form.formState.isSubmitted;
  return (
    <div className="space-y-4">
      {!listing && (
        <SearchBox
          label="Find a material or store"
          value={search}
          onChange={(value) => {
            setSearch(value);
            setCursor(undefined);
            form.reset();
          }}
        />
      )}
      <DataState
        query={listing ? undefined : query}
        isEmpty={!listing && !query.data?.items.length}
        icon={PackageSearch}
        emptyTitle="No materials found"
        emptyText="Try another search."
      >
        <form
          onSubmit={form.handleSubmit(async ({ listingId, weight }) => {
            const item =
              listing ??
              query.data?.items.find((item) => item.id === listingId);
            if (item) {
              const error = quantityError(weight, item.weight);
              if (error) {
                form.setError('weight', { message: error });
                return;
              }
              try {
                toast.dismiss('cart-saved');
                const result = await create.mutateAsync({
                  seller_id: item.seller_id,
                  items: [
                    {
                      stock_id: item.id,
                      material_id: item.material_id,
                      weight: weight.trim().replace(',', '.'),
                    },
                  ],
                });
                toast.success('Request sent. Stock is reserved for 48 hours.');
                await navigate({
                  to: '/messages/$requestId',
                  params: { requestId: result.id },
                });
                onDone();
              } catch (cause) {
                form.setError('root', {
                  message:
                    cause instanceof Error
                      ? cause.message
                      : 'Could not send your request.',
                });
              }
            } else
              form.setError('listingId', {
                message: 'Choose a material on this page.',
              });
          })}
          className="space-y-4"
          noValidate
        >
          <SelectField
            control={form.control}
            name="listingId"
            label="Material and store"
            options={
              (listing ? [listing] : query.data?.items)?.map((item) => ({
                value: item.id,
                label: `${item.material_name} · ${item.seller_name}`,
              })) ?? []
            }
          />
          <DecimalField
            control={form.control}
            name="weight"
            label="Quantity (kg)"
            description="Enter a quantity above 0 kg, with up to 2 decimals."
            counter={weightCounter(selected?.weight)}
          />
          {showProblem && problem && !form.formState.errors.weight && (
            <p role="alert" className="text-sm text-destructive">
              {problem}
            </p>
          )}
          {form.formState.errors.root?.message && (
            <p role="alert" className="text-destructive">
              {form.formState.errors.root.message}
            </p>
          )}
          <Button
            type="submit"
            disabled={create.isPending || !selected || !!problem}
          >
            Send request
          </Button>
        </form>
      </DataState>
      {!listing && (
        <div className="flex gap-3">
          {cursor && (
            <Button
              variant="outline"
              onClick={() => {
                setCursor(undefined);
                form.reset();
              }}
            >
              First page
            </Button>
          )}
          {query.data?.has_more && (
            <Button
              variant="outline"
              onClick={() => {
                setCursor(query.data?.next_cursor ?? undefined);
                form.reset();
              }}
            >
              Next page
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
