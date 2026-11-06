import { toast } from 'sonner';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { DecimalField } from '@/components/form-fields';
import { ResponsiveOverlay } from '@/components/responsive-overlay';
import { Button } from '@/components/ui/button';
import { useOffer } from '@/lib/api/requests';
import type { TradeRequest } from '@/lib/api/types';
import { formatRand, lineCents } from '@/lib/format';
import { priceCounter, quantityError, weightCounter } from '@/lib/quantity';

function priceError(raw: string): string | undefined {
  const price = raw.trim().replace(',', '.');
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(price) || !/[1-9]/.test(price)) {
    return 'Enter a price above R 0.00 with up to 2 decimals.';
  }
}

const schema = z.object({
  items: z
    .array(
      z.object({
        material_id: z.string(),
        weight: z.string().superRefine((value, ctx) => {
          const message = quantityError(value);
          if (message) ctx.addIssue({ code: 'custom', message });
        }),
        price: z.string().superRefine((value, ctx) => {
          const message = priceError(value);
          if (message) ctx.addIssue({ code: 'custom', message });
        }),
      })
    )
    .min(1),
});

export function OfferDialog({
  open,
  onOpenChange,
  request,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: TradeRequest;
}) {
  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={onOpenChange}
      title={request.status === 'offered' ? 'Counter offer' : 'Make an offer'}
      description="Set each weight and price per kg. Sending an offer reserves the stock for 48 hours."
    >
      {open && (
        <OfferForm request={request} onDone={() => onOpenChange(false)} />
      )}
    </ResponsiveOverlay>
  );
}

function OfferForm({
  request,
  onDone,
}: {
  request: TradeRequest;
  onDone: () => void;
}) {
  const offer = useOffer(request.id);
  const form = useForm({
    resolver: zodResolver(schema),
    // Check as the person types, so a bad price shows at once.
    mode: 'onChange',
    defaultValues: {
      items: request.items.map((item) => ({
        material_id: item.material_id,
        weight:
          item.offer_weight ??
          item.requested_weight ??
          item.available_weight ??
          '',
        price: item.offer_price ?? item.requested_price ?? '',
      })),
    },
  });
  const { fields } = useFieldArray({ control: form.control, name: 'items' });
  const lines = form.watch('items');
  const validLines = schema.safeParse({ items: lines }).success;
  const total = lines.reduce(
    (sum, line) => sum + lineCents(line.price, line.weight),
    0
  );

  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={form.handleSubmit(async (values) => {
        try {
          await offer.mutateAsync({
            items: values.items.map((item) => ({
              ...item,
              weight: item.weight.trim().replace(',', '.'),
              price: item.price.trim().replace(',', '.'),
            })),
          });
          toast.success(
            request.status === 'offered' ? 'Counter offer sent.' : 'Offer sent.'
          );
          onDone();
        } catch (cause) {
          form.setError('root', {
            message:
              cause instanceof Error
                ? cause.message
                : 'Could not send this offer.',
          });
        }
      })}
    >
      {fields.map((field, index) => (
        <fieldset key={field.id} className="space-y-3">
          <legend className="mb-2 font-medium">
            {request.items[index].material_name}
          </legend>
          <div className="grid gap-4">
            <DecimalField
              control={form.control}
              name={`items.${index}.weight`}
              label="Weight (kg)"
              counter={weightCounter(
                request.items[index].available_weight ?? undefined
              )}
            />
            <DecimalField
              control={form.control}
              name={`items.${index}.price`}
              label="Price per kg (R)"
              counter={priceCounter()}
            />
          </div>
        </fieldset>
      ))}
      <p className="font-medium tabular-nums">Total {formatRand(total)}</p>
      {form.formState.errors.root?.message && (
        <p role="alert" className="text-destructive">
          {form.formState.errors.root.message}
        </p>
      )}
      <Button
        type="submit"
        disabled={offer.isPending || !validLines || !form.formState.isValid}
      >
        {request.status === 'offered' ? 'Send counter offer' : 'Send offer'}
      </Button>
    </form>
  );
}
