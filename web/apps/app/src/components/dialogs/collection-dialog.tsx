import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2 } from 'lucide-react';
import { useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  ComboboxField,
  DecimalField,
  SelectField,
  TextField,
} from '@/components/form-fields';
import { IconButton } from '@/components/icon-button';
import { ResponsiveOverlay } from '@/components/responsive-overlay';
import { errorText } from '@/components/transactions/pager-state';
import { Button } from '@/components/ui/button';
import { useCollectorSelection } from '@/lib/api/collectors';
import { useMaterials } from '@/lib/api/materials';
import { useCreateCollection } from '@/lib/api/transactions';
import { formatRand, lineCents, toCents } from '@/lib/format';
import { priceCounter, quantityError, weightCounter } from '@/lib/quantity';

const line = z.object({
  material_id: z.string().min(1, 'Pick a material.'),
  weight: z.string().superRefine((value, ctx) => {
    const message = quantityError(value);
    if (message) ctx.addIssue({ code: 'custom', message });
  }),
  price: z
    .string()
    .refine(
      (value) => /^\d{1,12}([.,]\d{1,2})?$/.test(value.trim()),
      'Use up to 2 decimals.'
    )
    .refine((value) => toCents(value) > 0, 'Enter a price above R 0.00.'),
});

const schema = z.object({
  collector_id: z.string().min(1, 'Pick the collector.'),
  collection_day: z.string().min(1, 'Pick the collection date.'),
  lines: z
    .array(line)
    .min(1, 'Add at least one material.')
    .max(100, 'A collection holds at most 100 materials.')
    .refine(
      (lines) =>
        new Set(lines.map((item) => item.material_id)).size === lines.length,
      'Each material can be on the collection once.'
    ),
});

type Values = z.infer<typeof schema>;

type Props = { open: boolean; onOpenChange: (open: boolean) => void };

const emptyLine = { material_id: '', weight: '', price: '' };

const today = () => new Date().toISOString().slice(0, 10);

const exact = (value: string) => value.trim().replace(',', '.');

/** Record a collection: one collector, a date and one or more material lines. */
export function CollectionDialog({ open, onOpenChange }: Props) {
  const collectors = useCollectorSelection();
  const materials = useMaterials({ limit: 100 });
  const create = useCreateCollection();
  const [serverError, setServerError] = useState('');
  const { control, handleSubmit, watch, reset, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      collector_id: '',
      collection_day: today(),
      lines: [emptyLine],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });

  const total = watch('lines').reduce(
    (sum, item) => sum + lineCents(item.price || '0', item.weight || '0'),
    0
  );

  async function onSubmit(values: Values) {
    setServerError('');

    try {
      await create.mutateAsync({
        collector_id: values.collector_id,
        collection_day: values.collection_day,
        items: values.lines.map((item) => ({
          material_id: item.material_id,
          weight: exact(item.weight),
          price: exact(item.price),
        })),
      });
      toast.success('Collection recorded.');
      reset();
      onOpenChange(false);
    } catch (error) {
      setServerError(errorText(error));
    }
  }

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={onOpenChange}
      wide
      title="Record a collection"
      description="Materials you bought from a collector. Prices are per kg."
      footer={
        <Button disabled={create.isPending} onClick={handleSubmit(onSubmit)}>
          Record collection
        </Button>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <ComboboxField
            control={control}
            name="collector_id"
            label="Collector"
            options={(collectors.data ?? []).map((item) => ({
              value: item.id,
              label: item.name,
            }))}
          />
          <TextField
            control={control}
            name="collection_day"
            label="Collection date"
            type="date"
          />
        </div>
        {fields.map((field, index) => (
          <div
            key={field.id}
            className="grid items-start gap-3 sm:grid-cols-[1fr_11rem_12rem_auto]"
          >
            <SelectField
              control={control}
              name={`lines.${index}.material_id`}
              label="Material"
              options={(materials.data?.items ?? []).map((item) => ({
                value: item.id,
                label: item.name,
              }))}
            />
            <DecimalField
              control={control}
              name={`lines.${index}.weight`}
              label="Weight (kg)"
              counter={weightCounter()}
            />
            <DecimalField
              control={control}
              name={`lines.${index}.price`}
              label="R / kg"
              counter={priceCounter()}
            />
            <IconButton
              label={`Remove line ${index + 1}`}
              disabled={fields.length === 1}
              className="sm:mt-6"
              onClick={() => remove(index)}
            >
              <Trash2 />
            </IconButton>
          </div>
        ))}
        {formState.errors.lines?.root?.message && (
          <p role="alert" className="text-sm text-destructive">
            {formState.errors.lines.root.message}
          </p>
        )}
        <Button type="button" variant="ghost" onClick={() => append(emptyLine)}>
          <Plus data-icon="inline-start" />
          Add material line
        </Button>
        <p className="text-right font-semibold">
          Collection total:{' '}
          <span className="tabular-nums">{formatRand(total)}</span>
        </p>
        {serverError && (
          <p role="alert" className="text-sm text-destructive">
            {serverError}
          </p>
        )}
      </form>
    </ResponsiveOverlay>
  );
}
