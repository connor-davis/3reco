import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2, TriangleAlert } from 'lucide-react';
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
import {
  formatPhone,
  formatRand,
  formatRate,
  lineCents,
  toCents,
  today,
} from '@/lib/format';
import { priceCounter, quantityError, weightCounter } from '@/lib/quantity';

const line = z.object({
  material_id: z.string().min(1, 'Pick a material.'),
  weight: z.string().superRefine((value, ctx) => {
    const message = quantityError(value);
    if (message) ctx.addIssue({ code: 'custom', message });
  }),
  // The sign and zero come first, so "-1" is not told to use 2 decimals.
  price: z.string().superRefine((value, ctx) => {
    const text = value.trim();
    const number = /^-?\d*[.,]?\d*$/.test(text) && /\d/.test(text);
    let message = '';

    if (number && (text.startsWith('-') || !/[1-9]/.test(text))) {
      message = 'Enter a price above R 0.00.';
    } else if (!/^\d{1,12}([.,]\d{1,2})?$/.test(text)) {
      message = 'Use up to 2 decimals.';
    } else if (toCents(text) <= 0) {
      message = 'Enter a price above R 0.00.';
    }

    if (message) ctx.addIssue({ code: 'custom', message });
  }),
});

const schema = z.object({
  collector_id: z.string().min(1, 'Pick the collector.'),
  collection_day: z
    .string()
    .min(1, 'Pick the collection date.')
    .refine(
      (value) => value <= today(),
      'The collection date cannot be in the future.'
    ),
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

  const sorted = [...(materials.data?.items ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const lines = watch('lines');
  const total = lines.reduce(
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
              label: `${item.name} · ${item.phone ? formatPhone(item.phone) : item.email || ''}`,
            }))}
          />
          <TextField
            control={control}
            name="collection_day"
            label="Collection date"
            type="date"
            max={today()}
          />
        </div>
        {fields.map((field, index) => (
          <div
            key={field.id}
            className="grid items-start gap-3 sm:grid-cols-[1fr_1fr_auto]"
          >
            {/* Own row: the number fields need the width to show what was typed. */}
            <div className="sm:col-span-3">
              <SelectField
                control={control}
                name={`lines.${index}.material_id`}
                label="Material"
                options={sorted.map((item) => ({
                  value: item.id,
                  label: item.name,
                }))}
              />
            </div>
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
        {lines.map((item, index) => {
          const material = sorted.find((m) => m.id === item.material_id);
          const base = material?.price;
          const cents = toCents(item.price || '0');

          return material && base && cents > 0 && cents < toCents(base) ? (
            <p
              key={index}
              role="status"
              className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
            >
              <TriangleAlert
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              <span>
                {material.name} is below the base price of {formatRate(base)}.
                You can still save.
              </span>
            </p>
          ) : null;
        })}
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
