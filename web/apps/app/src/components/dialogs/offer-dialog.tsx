import { toast } from 'sonner';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { DecimalField } from '@/components/form-fields';
import { ResponsiveOverlay } from '@/components/responsive-overlay';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { useOffer } from '@/lib/api/requests';
import type { TradeRequest } from '@/lib/api/types';
import { formatKg, formatRand, lineCents, toGrams } from '@/lib/format';
import {
  priceCounter,
  priceError as priceFormatError,
  quantityError,
  weightCounter,
} from '@/lib/quantity';

// The most an offer may ask per kg, in cents. The server refuses the same.
const MAX_PRICE_CENTS = 100_000_00;

function priceError(raw: string): string | undefined {
  const price = raw.trim().replace(',', '.');
  return (
    priceFormatError(price) ??
    (lineCents(price, '1') > MAX_PRICE_CENTS
      ? 'Price must be R 100 000.00 per kg or less.'
      : undefined)
  );
}

// Only a hint: the cap is the stock on hand, so a bigger offer still goes.
function overAsked(weight?: string, asked?: string | null) {
  return weight && asked && toGrams(weight) > toGrams(asked)
    ? `The request was for ${formatKg(asked)}. You can still send this.`
    : undefined;
}

// A line carries the stock it has available, so its weight is checked against it.
const schema = z.object({
  items: z
    .array(
      z
        .object({
          material_id: z.string(),
          available: z.string().optional(),
          weight: z.string(),
          price: z.string(),
        })
        .superRefine((line, ctx) => {
          const weight = quantityError(
            line.weight,
            line.available || undefined
          );
          if (weight) {
            ctx.addIssue({ code: 'custom', message: weight, path: ['weight'] });
          }

          const price = priceError(line.price);
          if (price) {
            ctx.addIssue({ code: 'custom', message: price, path: ['price'] });
          }
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
        available: item.available_weight ?? '',
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
  // A total built on a bad price or weight would mislead, so show a dash.
  const totalText = validLines ? formatRand(total) : '-';

  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={form.handleSubmit(async (values) => {
        try {
          await offer.mutateAsync({
            items: values.items.map((item) => ({
              material_id: item.material_id,
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
            <div>
              <DecimalField
                control={form.control}
                name={`items.${index}.weight`}
                label="Weight (kg)"
                counter={{
                  ...weightCounter(
                    request.items[index].available_weight ?? undefined
                  ),
                  unit: undefined,
                }}
                description={overAsked(
                  lines[index]?.weight,
                  request.items[index].requested_weight
                )}
              />
            </div>
            <div>
              <DecimalField
                control={form.control}
                name={`items.${index}.price`}
                label="Price (R / kg)"
                counter={{ ...priceCounter(), unit: undefined }}
              />
            </div>
          </div>
        </fieldset>
      ))}
      <p className="font-medium tabular-nums">Total {totalText}</p>
      {form.formState.errors.root?.message && (
        <p role="alert" className="text-destructive">
          {form.formState.errors.root.message}
        </p>
      )}
      <DialogFooter>
        <Button
          type="submit"
          disabled={offer.isPending || !validLines || !form.formState.isValid}
        >
          {request.status === 'offered' ? 'Send counter offer' : 'Send offer'}
        </Button>
      </DialogFooter>
    </form>
  );
}
