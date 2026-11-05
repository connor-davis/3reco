import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { DecimalField, SelectField, TextField } from '@/components/form-fields';
import { ResponsiveOverlay } from '@/components/responsive-overlay';
import { Button } from '@/components/ui/button';
import { categories } from '@/lib/data/materials';
import { toCents } from '@/lib/format';
import { useMockList } from '@/lib/mock/hooks';
import type { Material } from '@/lib/types';

const schema = z.object({
  name: z.string().min(2, 'Enter the material name.'),
  category: z.string().min(1, 'Pick a category.'),
  carbonFactor: z
    .string()
    .refine((value) => toCents(value) > 0, 'Enter the kg CO₂ saved per kg.'),
  gwCode: z.string().min(3, 'Enter the GW code, for example GW-PET-01.'),
  referencePrice: z
    .string()
    .refine((value) => toCents(value) > 0, 'Enter a price above R 0.00.'),
});

type Values = z.infer<typeof schema>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Set when editing. Empty when adding.
  material?: Material;
};

/** Add or edit a catalogue material (admin only). */
export function MaterialDialog({ open, onOpenChange, material }: Props) {
  const list = useMockList('materials');
  const { control, handleSubmit } = useForm<Values>({
    resolver: zodResolver(schema),
    values: {
      name: material?.name ?? '',
      category: material?.category ?? '',
      carbonFactor: material?.carbonFactor ?? '',
      gwCode: material?.gwCode ?? '',
      referencePrice: material?.referencePrice ?? '',
    },
  });

  function onSubmit(values: Values) {
    const next = {
      ...values,
      category: values.category as Material['category'],
    };

    if (material) {
      list.update(material.id, next);
      toast.success('Material updated.');
    } else {
      list.add({
        id: values.name.toLowerCase().replace(/\W+/g, '-'),
        tag: values.name.split(' ')[0],
        ...next,
      });
      toast.success('Material added.');
    }

    onOpenChange(false);
  }

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={onOpenChange}
      title={material ? 'Edit material' : 'Add material'}
      description={
        material
          ? 'Changes show everywhere this material is named.'
          : 'Add a material you buy or sell, with its CO₂ factor.'
      }
      footer={
        <Button onClick={handleSubmit(onSubmit)}>
          {material ? 'Save changes' : 'Add material'}
        </Button>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <TextField control={control} name="name" label="Material name" />
        <SelectField
          control={control}
          name="category"
          label="Category"
          options={[...categories]}
        />
        <DecimalField
          control={control}
          name="carbonFactor"
          label="Carbon factor (kg CO₂ / kg)"
        />
        <TextField control={control} name="gwCode" label="GW code" />
        <DecimalField
          control={control}
          name="referencePrice"
          label="Reference price (R / kg)"
        />
      </form>
    </ResponsiveOverlay>
  );
}
