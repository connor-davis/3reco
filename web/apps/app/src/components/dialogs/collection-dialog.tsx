import { format as dateKey } from 'date-fns';
import { stockLimit } from '@/lib/limits';
import { useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  CalendarIcon,
  Plus,
  Trash2,
  TriangleAlert,
  Upload,
} from 'lucide-react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  ComboboxField,
  DecimalField,
  SelectField,
} from '@/components/form-fields';
import { IconButton } from '@/components/icon-button';
import { ResponsiveOverlay } from '@/components/responsive-overlay';
import { errorText } from '@/components/transactions/pager-state';
import { Calendar } from '@/components/ui/calendar';
import { buttonVariants } from '@/components/ui/button-variants';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { useCollectorSelection } from '@/lib/api/collectors';
import { useMaterials } from '@/lib/api/materials';
import {
  kinds,
  maxBytes,
  maxReceipts,
  useUploadReceipt,
} from '@/lib/api/receipts';
import { useStores } from '@/lib/api/stores';
import { useCreateCollection } from '@/lib/api/transactions';
import { useAuth } from '@/lib/auth/use-auth';
import { cn } from '@/lib/utils';
import {
  formatDate,
  formatPhone,
  formatRand,
  formatRate,
  lineCents,
  toCents,
  today,
} from '@/lib/format';
import {
  priceCounter,
  prefillPrice,
  priceError,
  quantityError,
  weightCounter,
} from '@/lib/quantity';

const line = z.object({
  material_id: z.string().min(1, 'Pick a material.'),
  weight: z.string().superRefine((value, ctx) => {
    const message =
      quantityError(value) ??
      stockLimit(value, 100_000_000n, 'Weight must be 1 000 000 kg or less.');
    if (message) ctx.addIssue({ code: 'custom', message });
  }),
  price: z.string().superRefine((value, ctx) => {
    const message =
      priceError(value) ??
      stockLimit(
        value,
        10_000_000n,
        'Price must be R 100 000.00 per kg or less.'
      );
    if (message) ctx.addIssue({ code: 'custom', message });
  }),
});

const schema = z.object({
  // Only admin and staff pick one; the dialog sends it for them alone.
  business_id: z.string().optional(),
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
    )
    .refine(
      (lines) =>
        // Bad numbers already show their own message; judge the total after.
        !lines.every((item) => line.safeParse(item).success) ||
        lines.reduce(
          (sum, item) => sum + lineCents(item.price, item.weight),
          0
        ) >= 1,
      'The total must be at least R 0.01.'
    ),
});

type Values = z.infer<typeof schema>;

type Props = { open: boolean; onOpenChange: (open: boolean) => void };

const emptyLine = { material_id: '', weight: '', price: '' };

const exact = (value: string) => value.trim().replace(',', '.');

/** Admin and staff record for a business they pick; a business records for itself. */
const picksBusiness = (role?: string | null) =>
  role === 'admin' || role === 'staff';

const businessMessage = 'Select the business that bought this.';

const businessMissing = (values: { business_id?: string }, picks: boolean) =>
  picks && !values.business_id;

/** The POST body; business_id goes only when admin or staff picked one. */
function collectionBody(values: Values, picks: boolean) {
  return {
    ...(picks && { business_id: values.business_id }),
    collector_id: values.collector_id,
    collection_day: values.collection_day,
    items: values.lines.map((item) => ({
      material_id: item.material_id,
      weight: exact(item.weight),
      price: exact(item.price),
    })),
  };
}

/** Record a collection: one collector, a date and one or more material lines. */
export function CollectionDialog({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const chooseBusiness = picksBusiness(user?.role);
  const collectors = useCollectorSelection();
  const materials = useMaterials({ limit: 100 });
  const create = useCreateCollection();
  const upload = useUploadReceipt();
  const [serverError, setServerError] = useState('');
  const [receipts, setReceipts] = useState<File[]>([]);
  const [receiptError, setReceiptError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [businessQuery, setBusinessQuery] = useState('');
  // Searching swaps the list, so remember every business seen to keep the pick.
  const seen = useRef(new Map<string, string>());
  const businesses = useStores(
    { limit: 50, q: businessQuery.trim() || undefined },
    // ponytail: one request per keystroke; add a debounce if it gets chatty.
    chooseBusiness && open
  );
  const { control, handleSubmit, watch, reset, formState, setError, setValue } =
    useForm<Values>({
      resolver: zodResolver(schema),
      // Say why a number is wrong when the user leaves the field, not only on save.
      mode: 'onTouched',
      defaultValues: {
        business_id: '',
        collector_id: '',
        collection_day: today(),
        lines: [emptyLine],
      },
    });
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });

  for (const store of businesses.data?.items ?? []) {
    seen.current.set(store.id, store.name);
  }
  const picked = watch('business_id');
  const businessOptions = (businesses.data?.items ?? []).map((store) => ({
    value: store.id,
    label: store.name,
    verified: store.business_verified,
  }));
  if (
    chooseBusiness &&
    picked &&
    !businessOptions.some((item) => item.value === picked)
  ) {
    businessOptions.push({
      value: picked,
      label: seen.current.get(picked) ?? '',
      verified: false,
    });
  }

  const sorted = [...(materials.data?.items ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const lines = watch('lines');
  const validLines = lines.every((item) => line.safeParse(item).success);
  const total = lines.reduce(
    (sum, item) => sum + lineCents(item.price || '0', item.weight || '0'),
    0
  );

  // A new material fills its default price unless the user typed their own.
  function pickMaterial(index: number, id: string) {
    const fill = prefillPrice(
      lines[index]?.price ?? '',
      sorted.find((m) => m.id === lines[index]?.material_id)?.price,
      sorted.find((m) => m.id === id)?.price
    );
    if (fill) {
      setValue(`lines.${index}.price`, fill, {
        shouldValidate: true,
        shouldDirty: true,
      });
    }
  }

  /** Bad files are refused here, so only good ones wait for the save. */
  function pickReceipts(picked: File[]) {
    const next = [...receipts];
    let message = '';

    for (const file of picked) {
      if (!kinds.includes(file.type)) {
        message = 'Choose a PNG or JPEG image.';
      } else if (file.size > maxBytes) {
        message = 'The image is over 5 MB.';
      } else if (next.length >= maxReceipts) {
        message = `A collection holds at most ${maxReceipts} receipts.`;
      } else {
        next.push(file);
      }
    }

    setReceiptError(message);
    setReceipts(next);
  }

  async function onSubmit(values: Values) {
    setServerError('');

    if (businessMissing(values, chooseBusiness)) {
      setError('business_id', { message: businessMessage });
      return;
    }

    let id: string;

    try {
      const created = await create.mutateAsync(
        collectionBody(values, chooseBusiness)
      );
      id = created.transaction_id;
    } catch (error) {
      setServerError(errorText(error));
      return;
    }

    // The collection is saved now; a receipt that fails must not undo that.
    const failed: string[] = [];
    setUploading(true);

    for (const file of receipts) {
      try {
        await upload.mutateAsync({ id, file });
      } catch {
        failed.push(file.name);
      }
    }

    setUploading(false);

    if (failed.length > 0) {
      toast.warning(
        `Collection recorded, but ${failed.join(', ')} did not upload. Add them from Invoice and receipts.`
      );
    } else if (receipts.length > 0) {
      toast.success(
        `Collection recorded with ${receipts.length} ${receipts.length === 1 ? 'receipt' : 'receipts'}.`
      );
    } else {
      toast.success('Collection recorded.');
    }

    reset();
    setReceipts([]);
    setReceiptError('');
    onOpenChange(false);
  }

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={onOpenChange}
      wide
      title="Record collection"
      description={
        (chooseBusiness
          ? 'Materials a business bought from a collector.'
          : 'Materials you bought from a collector.') + ' Prices are per kg.'
      }
      footer={
        <Button
          disabled={create.isPending || uploading}
          onClick={handleSubmit(onSubmit)}
        >
          Record collection
        </Button>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {chooseBusiness && (
          <ComboboxField
            control={control}
            name="business_id"
            label="Business"
            description="The business that bought these materials."
            onSearch={setBusinessQuery}
            options={businessOptions}
          />
        )}
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
          <Controller
            control={control}
            name="collection_day"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="collection-day">
                  Collection date
                </FieldLabel>
                <Popover open={dateOpen} onOpenChange={setDateOpen}>
                  <PopoverTrigger
                    render={
                      <Button
                        id="collection-day"
                        type="button"
                        variant="outline"
                        className="w-full justify-between font-normal"
                        aria-invalid={fieldState.invalid}
                        aria-describedby={
                          fieldState.error ? 'collection-day-error' : undefined
                        }
                        onBlur={field.onBlur}
                        ref={field.ref}
                      >
                        {field.value
                          ? formatDate(field.value)
                          : 'Pick the collection date.'}
                        <CalendarIcon aria-hidden="true" />
                      </Button>
                    }
                  />
                  <PopoverContent className="w-auto p-0" align="end">
                    <Calendar
                      mode="single"
                      selected={
                        field.value
                          ? new Date(`${field.value}T00:00:00`)
                          : undefined
                      }
                      defaultMonth={
                        field.value
                          ? new Date(`${field.value}T00:00:00`)
                          : undefined
                      }
                      disabled={(day) => dateKey(day, 'yyyy-MM-dd') > today()}
                      onSelect={(day) => {
                        if (day) {
                          field.onChange(dateKey(day, 'yyyy-MM-dd'));
                          field.onBlur();
                          setDateOpen(false);
                        }
                      }}
                    />
                  </PopoverContent>
                </Popover>
                <FieldError
                  id="collection-day-error"
                  errors={[fieldState.error]}
                />
              </Field>
            )}
          />
        </div>
        {fields.map((field, index) => (
          <div
            key={field.id}
            className="grid items-start gap-4 sm:grid-cols-2 [&>[data-slot=field]]:min-w-0"
          >
            {/* Keep removal beside the material so both amounts fill their columns. */}
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:col-span-2">
              <SelectField
                control={control}
                name={`lines.${index}.material_id`}
                label="Material"
                options={sorted.map((item) => ({
                  value: item.id,
                  label: item.name,
                }))}
                onPick={(id) => pickMaterial(index, id)}
              />
              <IconButton
                label={`Remove line ${index + 1}`}
                disabled={fields.length === 1}
                className="mt-8"
                onClick={() => remove(index)}
              >
                <Trash2 />
              </IconButton>
            </div>
            <DecimalField
              control={control}
              name={`lines.${index}.weight`}
              label="Weight"
              counter={weightCounter()}
            />
            <DecimalField
              control={control}
              name={`lines.${index}.price`}
              label="Price"
              counter={priceCounter()}
            />
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
          <span className="tabular-nums">
            {validLines ? formatRand(total) : '-'}
          </span>
        </p>
        <Field data-invalid={receiptError !== ''}>
          <FieldLabel>Receipts</FieldLabel>
          <ul className="space-y-2">
            {receipts.map((file, index) => (
              <li
                key={`${file.name}-${index}`}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="min-w-0 truncate">{file.name}</span>
                <IconButton
                  label={`Remove receipt ${file.name}`}
                  disabled={create.isPending || uploading}
                  onClick={() =>
                    setReceipts(receipts.filter((_, i) => i !== index))
                  }
                >
                  <Trash2 />
                </IconButton>
              </li>
            ))}
          </ul>
          {receipts.length < maxReceipts && (
            <>
              <Input
                id="collection-receipts"
                type="file"
                multiple
                className="peer sr-only"
                accept="image/png,image/jpeg"
                aria-invalid={receiptError !== ''}
                onChange={(event) => {
                  pickReceipts(Array.from(event.target.files ?? []));
                  event.target.value = '';
                }}
              />
              <FieldLabel
                htmlFor="collection-receipts"
                className={cn(
                  buttonVariants({ variant: 'outline' }),
                  'w-fit cursor-pointer peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50'
                )}
              >
                <Upload data-icon="inline-start" />
                Add receipts
              </FieldLabel>
            </>
          )}
          <FieldDescription>
            PNG or JPEG, up to 5 MB. Up to {maxReceipts} receipts.
          </FieldDescription>
          {receiptError && (
            <p role="alert" className="text-sm text-destructive">
              {receiptError}
            </p>
          )}
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
