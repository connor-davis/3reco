import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { DecimalField, SelectField } from '@/components/form-fields';
import { ResponsiveOverlay } from '@/components/responsive-overlay';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import { materialById } from '@/lib/data/materials';
import { myStoreId } from '@/lib/data/stores';
import { toCents, toGrams } from '@/lib/format';
import { useMock, useMockList } from '@/lib/mock/hooks';
import type { Listing } from '@/lib/types';

const schema = z.object({
  materialId: z.string().min(1, 'Pick a material.'),
  availableKg: z
    .string()
    .refine(
      (value) => toGrams(value) >= minLotGrams,
      'The smallest lot is 50 kg.'
    )
    .refine(
      (value) => /^\d+([.,]\d{1,2})?$/.test(value.trim()),
      'Use up to 2 decimals.'
    ),
  pricePerKg: z
    .string()
    .refine((value) => toCents(value) > 0, 'Enter a price above R 0.00.'),
  listed: z.boolean(),
});

// A lot below this is not worth a collection trip (the minimum order is 50 kg).
const minLotGrams = 50_000;

type Values = z.infer<typeof schema>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stock?: Listing;
};

// Bulk tiers drop the rate by 20c at 1 000 kg and 60c at 5 000 kg (never below 10c).
function centsToText(cents: number): string {
  const safe = Math.max(10, cents);

  return `${Math.floor(safe / 100)}.${String(safe % 100).padStart(2, '0')}`;
}

/** Add or edit one of the business's own stock lines. */
export function StockDialog({ open, onOpenChange, stock }: Props) {
  const { data } = useMock();
  const list = useMockList('stock');
  const { control, handleSubmit, watch, setValue } = useForm<Values>({
    resolver: zodResolver(schema),
    values: {
      materialId: stock?.materialId ?? '',
      availableKg: stock?.availableKg ?? '',
      pricePerKg: stock?.priceBreaks[0].pricePerKg ?? '',
      listed: stock?.listed ?? true,
    },
  });

  function onSubmit(values: Values) {
    const base = toCents(values.pricePerKg);
    const material = materialById(values.materialId);
    const priceBreaks = [
      { fromKg: '0', pricePerKg: values.pricePerKg },
      { fromKg: '1000', pricePerKg: centsToText(base - 20) },
      { fromKg: '5000', pricePerKg: centsToText(base - 60) },
    ];

    if (stock) {
      list.update(stock.id, {
        materialId: values.materialId,
        title: material.name,
        availableKg: values.availableKg,
        listed: values.listed,
        priceBreaks,
      });
      toast.success('Stock updated.');
    } else {
      list.add({
        id: `stk-${300 + list.items.length}`,
        storeId: myStoreId,
        materialId: values.materialId,
        title: material.name,
        availableKg: values.availableKg,
        minKg: '50',
        listed: values.listed,
        priceBreaks,
      });
      toast.success('Stock added.');
    }

    onOpenChange(false);
  }

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={onOpenChange}
      title={stock ? 'Edit stock' : 'Add stock'}
      description="Listed stock shows up in the market. Bulk rates are worked out for you."
      footer={
        <Button onClick={handleSubmit(onSubmit)}>
          {stock ? 'Save changes' : 'Add stock'}
        </Button>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <SelectField
          control={control}
          name="materialId"
          label="Material"
          options={data.materials.map((m) => ({ value: m.id, label: m.name }))}
        />
        <DecimalField
          control={control}
          name="availableKg"
          label="Available weight (kg)"
        />
        <DecimalField
          control={control}
          name="pricePerKg"
          label="Price (R / kg)"
        />
        <Field orientation="horizontal">
          <Switch
            id="stock-listed"
            checked={watch('listed')}
            onCheckedChange={(checked) => setValue('listed', checked)}
          />
          <FieldLabel htmlFor="stock-listed" className="font-normal">
            Show in the market
          </FieldLabel>
        </Field>
      </form>
    </ResponsiveOverlay>
  );
}
