import { useMemo } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { DecimalField, TextField } from '@/components/form-fields';
import { ResponsiveOverlay } from '@/components/responsive-overlay';
import { Button } from '@/components/ui/button';
import { FieldGroup, FieldSet } from '@/components/ui/field';
import { materialById } from '@/lib/data/materials';
import { formatRand, lineCents, toCents } from '@/lib/format';
import { useMock, useMockList } from '@/lib/mock/hooks';
import { quantityError } from '@/lib/quantity';
import type { MarketRequest } from '@/lib/types';

const lineSchema = z.object({
  materialId: z.string(),
  pricePerKg: z
    .string()
    .refine((value) => toCents(value) > 0, 'Enter a price above R 0.00.'),
  kg: z.string(),
});

type Values = {
  lines: z.infer<typeof lineSchema>[];
  window: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: MarketRequest;
};

/** The seller's offer. It always carries every material line of the request. */
export function OfferDialog({ open, onOpenChange, request }: Props) {
  const { data } = useMock();
  const requests = useMockList('requests');
  const messages = useMockList('messages');

  // The seller can only offer what their own stock allows.
  const schema = useMemo(
    () =>
      z.object({
        lines: z.array(lineSchema).superRefine((lines, ctx) => {
          lines.forEach((line, index) => {
            const stock = data.stock.find(
              (item) => item.materialId === line.materialId
            );
            const message = quantityError(line.kg, stock?.availableKg);

            if (message) {
              ctx.addIssue({
                code: 'custom',
                message,
                path: [index, 'kg'],
              });
            }
          });
        }),
        window: z
          .string()
          .min(3, 'Say when you can collect, for example "Friday 09:00".'),
      }),
    [data.stock]
  );

  const { control, handleSubmit } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      lines: request.items,
      window: request.collection.window,
    },
  });
  const { fields } = useFieldArray({ control, name: 'lines' });
  const lines = useWatch({ control, name: 'lines' });
  const totalCents = lines.reduce(
    (sum, line) => sum + lineCents(line.pricePerKg, line.kg),
    0
  );

  function onSubmit(values: Values) {
    const total = values.lines.reduce(
      (sum, line) => sum + lineCents(line.pricePerKg, line.kg),
      0
    );
    const text = `Offer: ${formatRand(total)} for ${values.lines.length} ${
      values.lines.length === 1 ? 'material' : 'materials'
    }. Collection: ${values.window}.`;

    requests.update(request.id, {
      status: 'Offer sent',
      offerPending: true,
      items: values.lines,
      collection: { ...request.collection, window: values.window },
      preview: text,
      lastAt: 'Now',
    });
    messages.append({
      id: `${request.id}-m${messages.items.length}`,
      requestId: request.id,
      from: 'me',
      text,
      sentAt: new Date().toISOString(),
    });
    toast.success('Offer sent.');
    onOpenChange(false);
  }

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={onOpenChange}
      title="Make an offer"
      description="Set a weight and price for each material. The buyer can accept or decline."
      footer={
        <>
          <p className="mr-auto text-sm font-medium tabular-nums">
            Total {formatRand(totalCents)}
          </p>
          <Button onClick={handleSubmit(onSubmit)}>Send offer</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FieldGroup>
          {fields.map((field, index) => (
            <FieldSet key={field.id}>
              <p className="text-sm font-medium">
                {materialById(field.materialId).name}
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <DecimalField
                  control={control}
                  name={`lines.${index}.kg`}
                  label="Weight (kg)"
                />
                <DecimalField
                  control={control}
                  name={`lines.${index}.pricePerKg`}
                  label="Price per kg (R)"
                />
              </div>
            </FieldSet>
          ))}
        </FieldGroup>
        <TextField control={control} name="window" label="Collection window" />
      </form>
    </ResponsiveOverlay>
  );
}
