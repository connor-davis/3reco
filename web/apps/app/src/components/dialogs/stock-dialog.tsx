import { stockLimit } from '@/lib/limits';
import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { TriangleAlert } from 'lucide-react';
import { z } from 'zod';
import { DecimalField, SelectField } from '@/components/form-fields';
import { ResponsiveOverlay } from '@/components/responsive-overlay';
import { errorText } from '@/components/transactions/pager-state';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useMaterials } from '@/lib/api/materials';
import {
  useCreateStock,
  useUpdateStock,
  useUploadStockImage,
  useUploadNewStockImage,
  useDeleteStockImage,
} from '@/lib/api/stock';
import type { StockItem } from '@/lib/api/types';
import { ApiError } from '@/lib/api/client';
import { formatRate, toCents } from '@/lib/format';
import {
  priceCounter,
  priceError,
  prefillPrice,
  quantityError,
  weightCounter,
} from '@/lib/quantity';

const decimal = /^\d{1,12}([.,]\d{1,2})?$/;

const schema = (stock?: StockItem) =>
  z.object({
    material_id: z.string().min(1, 'Pick a material.'),
    weight: z.string().superRefine((value, ctx) => {
      if (sameAmount(value, stock?.weight)) return;
      const message =
        quantityError(value) ??
        stockLimit(value, 100_000_000n, 'Weight must be 1 000 000 kg or less.');
      if (message) ctx.addIssue({ code: 'custom', message });
    }),
    price: z.string().superRefine((value, ctx) => {
      if (sameAmount(value, stock?.price)) return;
      const message =
        priceError(value) ??
        stockLimit(
          value,
          10_000_000n,
          'Price must be R 100 000.00 per kg or less.'
        );
      if (message) ctx.addIssue({ code: 'custom', message });
    }),
    is_listed: z.boolean(),
  });

type Values = z.infer<ReturnType<typeof schema>>;

function sameAmount(value: string, original?: string) {
  const canonical = (raw: string) =>
    raw
      .trim()
      .replace(',', '.')
      .replace(/^0+(?=\d)/, '')
      .replace(/(\.\d*?)0+$/, '$1')
      .replace(/\.$/, '');
  return (
    original !== undefined &&
    /^\d+(\.\d+)?$/.test(value.trim().replace(',', '.')) &&
    canonical(value) === canonical(original)
  );
}

// Any positive price saves; below the material's default only earns a warning.
function belowDefault(price: string, base?: string) {
  return base && decimal.test(price.trim()) && toCents(price) < toCents(base)
    ? `Below the default price of ${formatRate(base)}. You can still save.`
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
  const uploadPhoto = useUploadStockImage(stock?.id ?? '');
  const addPhoto = useUploadNewStockImage();
  const deletePhoto = useDeleteStockImage(stock?.id ?? '');
  const [photo, setPhoto] = useState<File | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [preview, setPreview] = useState('');
  const [photoError, setPhotoError] = useState('');

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);
  const { control, handleSubmit, watch, setValue, setError, formState } =
    useForm<Values>({
      resolver: zodResolver(schema(stock)),
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
  const warning = belowDefault(watch('price'), base);

  // A new material fills its default price unless the user typed their own.
  function pickMaterial(id: string) {
    const fill = prefillPrice(
      watch('price'),
      chosen?.price,
      items.find((item) => item.id === id)?.price
    );
    if (fill)
      setValue('price', fill, { shouldValidate: true, shouldDirty: true });
  }

  async function onSubmit(values: Values) {
    setServerError('');
    const weight = exact(values.weight);
    const price = exact(values.price);

    try {
      if (stock) {
        await update.mutateAsync({
          weight: sameAmount(weight, stock.weight) ? undefined : weight,
          price: sameAmount(price, stock.price) ? undefined : price,
          is_listed: values.is_listed,
        });
        if (photo) await uploadPhoto.mutateAsync(photo);
        else if (removePhoto) await deletePhoto.mutateAsync(undefined);
        // Say what changed about the market when the switch moved.
        toast.success(
          values.is_listed === stock.is_listed
            ? 'Stock updated.'
            : values.is_listed
              ? 'Stock is now listed in the market.'
              : 'Stock is no longer listed.'
        );
      } else {
        const created = await create.mutateAsync({ ...values, weight, price });
        if (photo) {
          try {
            await addPhoto.mutateAsync({ id: created.id, file: photo });
          } catch {
            // The stock exists now; creating it again would double it.
            toast.warning(
              'Stock added, but the photo did not upload. Edit the stock to try again.'
            );
            onOpenChange(false);
            return;
          }
        }
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

  const busy =
    create.isPending ||
    update.isPending ||
    uploadPhoto.isPending ||
    addPhoto.isPending ||
    deletePhoto.isPending;
  // Once someone interacts, only the fields explain what needs fixing.
  const pristine =
    !stock &&
    !formState.isDirty &&
    Object.keys(formState.touchedFields).length === 0 &&
    Object.keys(formState.errors).length === 0;

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={(next) => !busy && onOpenChange(next)}
      title={stock ? 'Edit stock' : 'Add stock'}
      description="Listed stock shows up in the market. Prices are per kg."
      footer={
        <div className="w-full space-y-2">
          <div className="h-10">
            {serverError && (
              <p role="alert" className="text-sm text-destructive">
                {serverError}
              </p>
            )}
            {pristine && (
              <p role="status" className="text-sm text-muted-foreground">
                Pick a material, then enter a weight and a price.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              disabled={busy || !formState.isValid || !!photoError}
              onClick={handleSubmit(onSubmit)}
            >
              {stock ? 'Save changes' : 'Add stock'}
            </Button>
          </DialogFooter>
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
            onPick={pickMaterial}
          />
        )}
        <DecimalField
          control={control}
          name="weight"
          label="Weight (kg)"
          counter={{ ...weightCounter(), unit: undefined }}
          description={
            stock && stock.available_weight !== stock.weight
              ? 'Some of this stock is held for open offers or carts.'
              : undefined
          }
        />
        <DecimalField
          control={control}
          name="price"
          label="Price (R / kg)"
          counter={{ ...priceCounter(), unit: undefined }}
          description={
            base
              ? `Default price is ${formatRate(base)}. You can set your own.`
              : 'Pick a material to see its default price.'
          }
        />
        {warning && (
          <p
            role="status"
            className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
          >
            <TriangleAlert
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <span>{warning}</span>
          </p>
        )}
        <Field>
          <FieldLabel htmlFor="stock-photo">Photo</FieldLabel>
          <p className="text-sm text-muted-foreground">
            Upload a PNG, JPEG or WebP image up to 2 MiB.
          </p>
          <Input
            id="stock-photo"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={busy}
            onChange={(event) => {
              const next = event.target.files?.[0];
              setPhoto(null);
              setPreview('');
              setPhotoError('');
              if (!next) return;
              if (
                !['image/png', 'image/jpeg', 'image/webp'].includes(
                  next.type
                ) ||
                next.size === 0 ||
                next.size > 2 * 1024 * 1024
              ) {
                setPhotoError('Choose a PNG, JPEG or WebP image up to 2 MiB.');
                return;
              }
              setPhoto(next);
              setRemovePhoto(false);
              setPreview(URL.createObjectURL(next));
            }}
          />
          {(preview || (!removePhoto && stock?.image_url)) && (
            <>
              <img
                src={preview || stock?.image_url}
                alt={stock?.material_name ?? chosen?.name ?? 'Stock photo'}
                className="h-32 w-full rounded-lg object-cover"
              />
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setPhoto(null);
                  setPreview('');
                  setPhotoError('');
                  setRemovePhoto(true);
                }}
              >
                Remove picture
              </Button>
            </>
          )}
          {photoError && (
            <p role="alert" className="text-sm text-destructive">
              {photoError}
            </p>
          )}
        </Field>
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
      </form>
    </ResponsiveOverlay>
  );
}
