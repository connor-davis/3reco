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
import { Button } from '@/components/ui/button';
import { myBusinessName } from '@/lib/data/ledger';
import { formatRand, lineCents, toCents, toGrams } from '@/lib/format';
import { useMock, useMockList } from '@/lib/mock/hooks';

const line = z.object({
  materialId: z.string().min(1, 'Pick a material.'),
  kg: z
    .string()
    .refine((value) => toGrams(value) > 0, 'Enter a weight above 0 kg.'),
  pricePerKg: z
    .string()
    .refine((value) => toCents(value) > 0, 'Enter a price above R 0.00.'),
});

const schema = z.object({
  collectorId: z.string().min(1, 'Pick the collector.'),
  date: z.string().min(1, 'Pick the collection date.'),
  lines: z.array(line).min(1, 'Add at least one material.'),
});

type Values = z.infer<typeof schema>;

type Props = { open: boolean; onOpenChange: (open: boolean) => void };

const emptyLine = { materialId: '', kg: '', pricePerKg: '' };

/** Record a collection: one collector, a date and one or more material lines. */
export function CollectionDialog({ open, onOpenChange }: Props) {
  const { data } = useMock();
  const transactions = useMockList('transactions');
  const { control, handleSubmit, watch, reset } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      collectorId: '',
      date: new Date().toISOString().slice(0, 10),
      lines: [emptyLine],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });

  const total = watch('lines').reduce(
    (sum, item) => sum + lineCents(item.pricePerKg || '0', item.kg || '0'),
    0
  );

  function onSubmit(values: Values) {
    const collector = data.collectors.find(
      (item) => item.id === values.collectorId
    );

    values.lines.forEach((item, index) => {
      transactions.add({
        id: `COL-${1100 + transactions.items.length + index}`,
        type: 'C2B',
        collectorId: values.collectorId,
        seller: collector?.name ?? 'Collector',
        buyer: myBusinessName,
        materialId: item.materialId,
        kg: item.kg,
        pricePerKg: item.pricePerKg,
        status: 'Pending',
        date: values.date,
        receipts: 0,
      });
    });

    toast.success('Collection recorded.');
    reset();
    onOpenChange(false);
  }

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={onOpenChange}
      wide
      title="Record a collection"
      description="Materials you bought from a collector."
      footer={
        <Button onClick={handleSubmit(onSubmit)}>Record collection</Button>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <ComboboxField
            control={control}
            name="collectorId"
            label="Collector"
            options={data.collectors.map((item) => ({
              value: item.id,
              label: item.name,
            }))}
          />
          <TextField
            control={control}
            name="date"
            label="Collection date"
            type="date"
          />
        </div>
        {fields.map((field, index) => (
          <div
            key={field.id}
            className="grid items-start gap-3 sm:grid-cols-[1fr_7rem_7rem_auto]"
          >
            <SelectField
              control={control}
              name={`lines.${index}.materialId`}
              label="Material"
              options={data.materials.map((item) => ({
                value: item.id,
                label: item.name,
              }))}
            />
            <DecimalField
              control={control}
              name={`lines.${index}.kg`}
              label="Weight (kg)"
            />
            <DecimalField
              control={control}
              name={`lines.${index}.pricePerKg`}
              label="R / kg"
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
        <Button type="button" variant="ghost" onClick={() => append(emptyLine)}>
          <Plus data-icon="inline-start" />
          Add material line
        </Button>
        <p className="text-right font-semibold">
          Collection total:{' '}
          <span className="tabular-nums">{formatRand(total)}</span>
        </p>
      </form>
    </ResponsiveOverlay>
  );
}
