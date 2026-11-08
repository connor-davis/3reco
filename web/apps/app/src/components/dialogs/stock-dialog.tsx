import { useEffect, useRef, useState } from 'react';
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
import { formatRate, toCents } from '@/lib/format';
import {
  priceCounter,
  priceError,
  quantityError,
  weightCounter,
} from '@/lib/quantity';

const decimal = /^\d{1,12}([.,]\d{1,2})?$/;

const schema = z.object({
  material_id: z.string().min(1, 'Pick a material.'),
  weight: z.string().superRefine((value, ctx) => {
    const message = quantityError(value);
    if (message) ctx.addIssue({ code: 'custom', message });
  }),
  price: z.string().superRefine((value, ctx) => {
    const message = priceError(value);
    if (message) ctx.addIssue({ code: 'custom', message });
  }),
  is_listed: z.boolean(),
});

type Values = z.infer<typeof schema>;

// Same words as the server, so the message reads the same before and after Save.
function belowBase(price: string, base?: string) {
  return base && decimal.test(price.trim()) && toCents(price) < toCents(base)
    ? `Price must be at least ${formatRate(base)}.`
    : undefined;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stock?: StockItem;
};

const exact = (value: string) => value.trim().replace(',', '.');

/** Add or edit one of the business's own stock lines. */
export function StockDialog(props: Props) {
  return props.open ? <StockForm {...props} /> : null;
}

function StockForm({ open, onOpenChange, stock }: Props) {
  const materials = useMaterials({ limit: 100 });
  const create = useCreateStock();
  const update = useUpdateStock(stock?.id ?? '');
  const [serverError, setServerError] = useState('');
  // The resolver reads the base price from here, so it follows the material.
  const baseRef = useRef<string | undefined>(undefined);
  const {
    control,
    handleSubmit,
    watch,
    setValue,
    setError,
    trigger,
    formState,
  } = useForm<Values>({
    resolver: async (values, context, options) => {
      const result = await zodResolver(schema)(values, context, options);
      const message = belowBase(values.price, baseRef.current);
      if (!message || 'price' in result.errors) return result;

      return {
        values: {},
        errors: { ...result.errors, price: { type: 'min', message } },
      };
    },
    mode: 'onChange',
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
  baseRef.current = base;

  // A new material changes the lowest price, so check the typed price again.
  useEffect(() => {
    if (watch('price')) void trigger('price');
  }, [base, trigger, watch]);

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
        // Say what changed about the market when the switch moved.
        toast.success(
          values.is_listed === stock.is_listed
            ? 'Stock updated.'
            : values.is_listed
              ? 'Stock is now listed in the market.'
              : 'Stock is no longer listed.'
        );
      } else {
        await create.mutateAsync({ ...values, weight, price });
        toast.success('Stock added.');
      }
      onOpenChange(false);
    } catch (error) {
      // A message on its own field is enough; the banner is for the rest.
      const named =
        error instanceof ApiError && error.fields
          ? Object.entries(error.fields).filter(([name]) => name in values)
          : [];
      for (const [name, message] of named) {
        setError(name as keyof Values, { message });
      }
      if (!named.length) setServerError(errorText(error));
    }
  }

  const busy = create.isPending || update.isPending;
  // Once someone interacts, only the fields explain what needs fixing.
  const pristine =
    !stock &&
    !formState.isDirty &&
    Object.keys(formState.touchedFields).length === 0 &&
    Object.keys(formState.errors).length === 0;

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={onOpenChange}
      title={stock ? 'Edit stock' : 'Add stock'}
      description="Listed stock shows up in the market. Prices are per kg."
      footer={
        <div className="space-y-2">
          <Button
            disabled={busy || !formState.isValid}
            onClick={handleSubmit(onSubmit)}
          >
            {stock ? 'Save changes' : 'Add stock'}
          </Button>
          {pristine && (
            <p role="status" className="text-sm text-muted-foreground">
              Pick a material, then enter a weight and a price.
            </p>
          )}
        </div>
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
          counter={weightCounter()}
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
          counter={priceCounter(base)}
          description={
            base
              ? `At least ${formatRate(base)}.`
              : 'Pick a material to see its lowest price.'
          }
        />
        <Field orientation="horizontal">
          <Switch
            id="stock-listed"
            checked={watch('is_listed')}
            onCheckedChange={(checked) =>
              setValue('is_listed', checked, { shouldDirty: true })
            }
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
