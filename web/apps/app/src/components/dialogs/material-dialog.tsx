import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { DecimalField, TextField } from '@/components/form-fields';
import { ResponsiveOverlay } from '@/components/responsive-overlay';
import { errorText } from '@/components/transactions/pager-state';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api/client';
import {
  useCreateMaterial,
  useUpdateMaterial,
  useMaterialCatalog,
} from '@/lib/api/materials';
import type { Material } from '@/lib/api/types';
import { toCents } from '@/lib/format';
import { priceCounter } from '@/lib/quantity';

const decimal = /^\d{1,12}([.,]\d{1,2})?$/;

const schema = z.object({
  name: z.string().trim().min(1, 'Enter the material name.'),
  carbon_factor: z
    .string()
    .refine(
      (value) => decimal.test(value.trim()),
      'Use up to 2 decimals, for example 1.50.'
    )
    .refine((value) => /[1-9]/.test(value), 'Enter the kg CO₂ saved per kg.'),
  gw_code: z.string().trim().min(1, 'Enter the GW code, for example GW13.'),
  price: z
    .string()
    .refine(
      (value) => decimal.test(value.trim()) && toCents(value) > 0,
      'Enter a price above R 0.00 with up to 2 decimals.'
    )
    .refine(
      (value) => toCents(value) <= 10000000,
      'Price must be R 100000.00 per kg or less.'
    ),
});

type Values = z.infer<typeof schema>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Set when editing. Empty when adding.
  material?: Material;
};

const exact = (value: string) => value.trim().replace(',', '.');

/** Add or edit a catalogue material (admin only). */
export function MaterialDialog({ open, onOpenChange, material }: Props) {
  const create = useCreateMaterial();
  const catalog = useMaterialCatalog();
  const update = useUpdateMaterial(material?.id ?? '');
  const [serverError, setServerError] = useState('');
  const { control, handleSubmit, setError, reset } = useForm<Values>({
    resolver: zodResolver(schema),
    values: {
      name: material?.name ?? '',
      carbon_factor: material?.carbon_factor ?? '',
      gw_code: material?.gw_code ?? '',
      price: material?.price ?? '',
    },
  });

  async function onSubmit(values: Values) {
    setServerError('');
    let duplicate = false;
    for (const field of ['name', 'gw_code'] as const) {
      if (
        catalog.data?.some(
          (item) =>
            item.id !== material?.id &&
            item[field].trim().toLowerCase() ===
              values[field].trim().toLowerCase()
        )
      ) {
        setError(field, {
          message: `A material with this ${field === 'name' ? 'name' : 'GW code'} already exists.`,
        });
        duplicate = true;
      }
    }
    if (duplicate) return;

    const input = {
      ...values,
      carbon_factor: exact(values.carbon_factor),
      price: exact(values.price),
    };

    try {
      if (material) {
        await update.mutateAsync(input);
        toast.success('Material updated.');
      } else {
        await create.mutateAsync(input);
        toast.success('Material added.');
      }
      reset();
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

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={onOpenChange}
      title={material ? 'Edit material' : 'Add material'}
      description={
        material
          ? 'Changes show everywhere this material is named.'
          : 'Add a material to the catalogue, with its CO₂ factor.'
      }
      footer={
        <Button
          disabled={create.isPending || update.isPending}
          onClick={handleSubmit(onSubmit)}
        >
          {material ? 'Save changes' : 'Add material'}
        </Button>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <TextField control={control} name="name" label="Material name" />
        <DecimalField
          control={control}
          name="carbon_factor"
          label="Carbon factor (kg CO₂ / kg)"
          counter={{
            noun: 'carbon factor',
            step: '0.01',
            min: '0.01',
            places: 2,
          }}
        />
        <TextField control={control} name="gw_code" label="GW code" />
        <DecimalField
          control={control}
          name="price"
          label="Base price (R / kg)"
          counter={priceCounter()}
        />
        {serverError && (
          <p role="alert" className="text-sm text-destructive">
            {serverError}
          </p>
        )}
      </form>
    </ResponsiveOverlay>
  );
}
