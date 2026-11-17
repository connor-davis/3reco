import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { DecimalField, SelectField, TextField } from '@/components/form-fields';
import { Panel } from '@/components/panel';
import { Button } from '@/components/ui/button';
import { useMaterialCatalog } from '@/lib/api/materials';
import { useCreateWanted } from '@/lib/api/wanted';
import {
  priceCounter,
  priceError,
  quantityError,
  weightCounter,
} from '@/lib/quantity';

const dayOptions = [
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
  { value: '30', label: '30 days' },
];

const schema = z
  .object({
    material_id: z.string().min(1, 'Pick a material.'),
    weight: z.string(),
    max_price: z.string(),
    area: z.string().trim().min(1, 'Type a rough area.').max(120),
    days: z.string(),
  })
  .superRefine((value, ctx) => {
    const weight = quantityError(value.weight);
    if (weight) {
      ctx.addIssue({ code: 'custom', message: weight, path: ['weight'] });
    }

    // The price ceiling is optional: empty means any price.
    const price = value.max_price.trim() ? priceError(value.max_price) : '';
    if (price) {
      ctx.addIssue({ code: 'custom', message: price, path: ['max_price'] });
    }
  });

type Values = z.infer<typeof schema>;

const empty: Values = {
  material_id: '',
  weight: '',
  max_price: '',
  area: '',
  days: '14',
};

/** The buyer's form for a new post. */
export function WantedForm() {
  const create = useCreateWanted();
  const materials = useMaterialCatalog();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: empty,
  });

  return (
    <Panel
      title="Post what you want"
      description="Verified sellers see the material, weight, top price and area. They do not see who you are until you open a reply."
    >
      <form
        className="grid max-w-xl gap-4"
        noValidate
        onSubmit={form.handleSubmit(async (values) => {
          try {
            await create.mutateAsync({
              material_id: values.material_id,
              weight: values.weight.trim().replace(',', '.'),
              max_price: values.max_price.trim().replace(',', '.'),
              area: values.area.trim(),
              days: Number(values.days),
            });
            toast.success('Your wanted post is live.');
            form.reset(empty);
          } catch (cause) {
            form.setError('root', {
              message:
                cause instanceof Error
                  ? cause.message
                  : 'Could not post this. Try again.',
            });
          }
        })}
      >
        <SelectField
          control={form.control}
          name="material_id"
          label="Material"
          placeholder="Pick a material"
          options={(materials.data ?? []).map((material) => ({
            value: material.id,
            label: material.name,
          }))}
        />
        <DecimalField
          control={form.control}
          name="weight"
          label="Weight (kg)"
          counter={{ ...weightCounter(), unit: undefined }}
        />
        <DecimalField
          control={form.control}
          name="max_price"
          label="Most you will pay (R / kg)"
          description="Leave empty to take any price."
          counter={{ ...priceCounter(), unit: undefined }}
        />
        <TextField
          control={form.control}
          name="area"
          label="Rough area"
          description="A town or region, like Pretoria, Gauteng. Not your address."
          maxLength={120}
        />
        <SelectField
          control={form.control}
          name="days"
          label="Stay open for"
          options={dayOptions}
        />
        {form.formState.errors.root?.message && (
          <p role="alert" className="text-destructive">
            {form.formState.errors.root.message}
          </p>
        )}
        <Button
          type="submit"
          className="w-full sm:w-auto"
          disabled={create.isPending || !form.formState.isValid}
        >
          Post it
        </Button>
      </form>
    </Panel>
  );
}
