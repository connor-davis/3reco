import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { DecimalField, SelectField } from '@/components/form-fields';
import { ResponsiveOverlay } from '@/components/responsive-overlay';
import { errorText } from '@/components/transactions/pager-state';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import { useMaterials } from '@/lib/api/materials';
import { useCreateStock, useUpdateStock } from '@/lib/api/stock';
import type { StockItem } from '@/lib/api/types';
import { ApiError } from '@/lib/api/client';
import { formatRate, toCents, toGrams } from '@/lib/format';

const decimal = /^\d{1,12}([.,]\d{1,2})?$/;

const schema = z.object({
  material_id: z.string().min(1, 'Pick a material.'),
  weight: z
    .string()
    .refine((value) => decimal.test(value.trim()), 'Use up to 2 decimals.')
    .refine((value) => toGrams(value) > 0, 'Enter a weight above 0 kg.'),
  price: z
    .string()
    .refine((value) => decimal.test(value.trim()), 'Use up to 2 decimals.')
    .refine((value) => toCents(value) > 0, 'Enter a price above R 0.00.'),
  is_listed: z.boolean(),
});

type Values = z.infer<typeof schema>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stock?: StockItem;
};

const exact = (value: string) => value.trim().replace(',', '.');

/** Add or edit one of the business's own stock lines. */
export function StockDialog({ open, onOpenChange, stock }: Props) {
  const materials = useMaterials({ limit: 100 });
  const create = useCreateStock();
  const update = useUpdateStock(stock?.id ?? '');
  const [serverError, setServerError] = useState('');
  const { control, handleSubmit, watch, setValue, setError } = useForm<Values>({
    resolver: zodResolver(schema),
    values: {
      material_id: stock?.material_id ?? '',
      weight: stock?.weight ?? '',
      price: stock?.price ?? '',
      is_listed: stock?.is_listed ?? true,
    },
  });

  const items = materials.data?.items ?? [];
  const chosen = items.find((item) => item.id === watch('material_id'));
  const base = stock?.base_price ?? chosen?.price;

  async function onSubmit(values: Values) {
    setServerError('');
    const weight = exact(values.weight);
    const price = exact(values.price);

    try {
      if (stock) {
        await update.mutateAsync({
          weight,
          price,
          is_listed: values.is_listed,
        });
        toast.success('Stock updated.');
      } else {
        await create.mutateAsync({ ...values, weight, price });
        toast.success('Stock added.');
      }
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError && error.fields) {
        for (const [name, message] of Object.entries(error.fields)) {
          if (name in values) setError(name as keyof Values, { message });
        }
      }
      setServerError(errorText(error));
    }
  }

  const busy = create.isPending || update.isPending;

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={onOpenChange}
      title={stock ? 'Edit stock' : 'Add stock'}
      description="Listed stock shows up in the market. Prices are per kg."
      footer={
        <Button disabled={busy} onClick={handleSubmit(onSubmit)}>
          {stock ? 'Save changes' : 'Add stock'}
        </Button>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {stock ? (
          <p className="text-sm">
            <span className="text-muted-foreground">Material: </span>
            <span className="font-medium">{stock.material_name}</span>
          </p>
        ) : (
          <SelectField
            control={control}
            name="material_id"
            label="Material"
            options={items.map((m) => ({ value: m.id, label: m.name }))}
          />
        )}
        <DecimalField
          control={control}
          name="weight"
          label="Weight (kg)"
          description={
            stock && stock.available_weight !== stock.weight
              ? 'Some of this stock is held for open offers.'
              : undefined
          }
        />
        <DecimalField
          control={control}
          name="price"
          label="Price (R / kg)"
          description={base ? `At least ${formatRate(base)}.` : undefined}
        />
        <Field orientation="horizontal">
          <Switch
            id="stock-listed"
            checked={watch('is_listed')}
            onCheckedChange={(checked) => setValue('is_listed', checked)}
          />
          <FieldLabel htmlFor="stock-listed" className="font-normal">
            Show in the market
          </FieldLabel>
        </Field>
        {serverError && (
          <p role="alert" className="text-sm text-destructive">
            {serverError}
          </p>
        )}
      </form>
    </ResponsiveOverlay>
  );
}
