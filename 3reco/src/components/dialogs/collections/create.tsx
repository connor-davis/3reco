import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useConvexMutation, useConvexQuery } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { ConvexError } from 'convex/values';
import { format } from 'date-fns';
import {
  CalendarIcon,
  CheckIcon,
  Loader2Icon,
  PlusIcon,
  TrashIcon,
  XIcon,
} from 'lucide-react';
import { type ChangeEvent, type ReactElement, useRef, useState } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod/v4';
import { parseCollectionDayInput } from '@/lib/transactions';

const MAX_RECEIPT_FILES = 5;
const MAX_RECEIPT_FILE_SIZE = 5 * 1024 * 1024;
const RECEIPT_ACCEPT = 'image/png,image/jpeg,image/jpg,image/webp,image/gif';
const ALLOWED_RECEIPT_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]);

type CollectionFormValues = z.infer<typeof collectionSchema>;

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getErrorDetails(error: unknown) {
  if (error instanceof ConvexError) {
    return {
      message: error.data.name as string,
      description: error.data.message as string,
    };
  }

  if (error instanceof Error) {
    return { message: error.name, description: error.message };
  }

  return {
    message: 'Unexpected Error',
    description: 'Something went wrong while processing this request.',
  };
}

function validateReceiptFiles(files: File[]) {
  const errors: string[] = [];

  if (files.length > MAX_RECEIPT_FILES) {
    errors.push(`You can upload up to ${MAX_RECEIPT_FILES} receipt images at a time.`);
  }

  const invalidTypeNames = files
    .filter((file) => !ALLOWED_RECEIPT_TYPES.has(file.type))
    .map((file) => file.name);

  if (invalidTypeNames.length > 0) {
    errors.push(
      `Unsupported receipt file type: ${invalidTypeNames.join(', ')}. Use PNG, JPEG, JPG, WEBP, or GIF.`
    );
  }

  const oversizedNames = files
    .filter((file) => file.size > MAX_RECEIPT_FILE_SIZE)
    .map((file) => `${file.name} (${formatBytes(file.size)})`);

  if (oversizedNames.length > 0) {
    errors.push(
      `Receipt images must be ${formatBytes(MAX_RECEIPT_FILE_SIZE)} or smaller: ${oversizedNames.join(', ')}.`
    );
  }

  return errors;
}

async function uploadReceiptFile(uploadUrl: string, file: File) {
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Type': file.type,
    },
    body: file,
  });

  if (!response.ok) {
    throw new Error(`Upload failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as { storageId?: Id<'_storage'> };

  if (!payload.storageId) {
    throw new Error('Upload completed without a storage reference.');
  }

  return payload.storageId;
}

const itemSchema = z.object({
  materialId: z.string({ error: 'Please select a material.' }),
  weight: z
    .number({ error: 'Please provide a weight.' })
    .positive({ error: 'Weight must be greater than zero.' }),
  price: z
    .number({ error: 'Please provide a price.' })
    .positive({ error: 'Price must be greater than zero.' }),
});

const collectionSchema = z.object({
  collectorId: z.string({ error: 'Please select a collector.' }),
  collectionDate: z.date().optional(),
  items: z.array(itemSchema).min(1, { error: 'At least one item is required.' }),
});

export default function CreateCollectionDialog({
  children,
}: {
  children?: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
  const [receiptErrors, setReceiptErrors] = useState<string[]>([]);

  const materials = useConvexQuery(api.materials.list, {});
  const collectors = useConvexQuery(api.collectors.listForSelection, {});

  const createCollection = useConvexMutation(
    api.transactions.collectorToBusinessSale
  );
  const generateReceiptUploadUrl = useConvexMutation(
    api.transactions.generateReceiptUploadUrl
  );
  const attachReceiptToTransaction = useConvexMutation(
    api.transactions.attachReceiptToTransaction
  );

  const receiptInputRef = useRef<HTMLInputElement | null>(null);

  const form = useForm<CollectionFormValues>({
    resolver: zodResolver(collectionSchema),
      defaultValues: {
        collectorId: '',
        collectionDate: undefined,
        items: [{ materialId: '', weight: 0, price: 0 }],
      },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
  });

  const resetReceiptSelection = () => {
    setReceiptFiles([]);
    setReceiptErrors([]);
    if (receiptInputRef.current) {
      receiptInputRef.current.value = '';
    }
  };

  const { mutate: submitCollection, isPending } = useMutation({
    mutationFn: async (values: CollectionFormValues) => {
      const validationErrors = validateReceiptFiles(receiptFiles);

      if (validationErrors.length > 0) {
        setReceiptErrors(validationErrors);
        throw new Error(validationErrors[0]);
      }

      const { transactionId } = await createCollection({
        collectorId: values.collectorId as Id<'collectors'>,
        collectionDay: values.collectionDate
          ? parseCollectionDayInput(values.collectionDate.toISOString())
          : undefined,
        collectionDate: values.collectionDate?.getTime(),
        items: values.items.map((item) => ({
          materialId: item.materialId as Id<'materials'>,
          weight: item.weight,
          price: item.price,
        })),
      });

      const uploadFailures: Array<{ fileName: string; reason: string }> = [];

      for (const file of receiptFiles) {
        try {
          const { uploadUrl, uploadSlot } = await generateReceiptUploadUrl({
            transactionId,
          });
          const storageId = await uploadReceiptFile(uploadUrl, file);

          await attachReceiptToTransaction({
            transactionId,
            uploadSlot,
            storageId,
          });
        } catch (error) {
          uploadFailures.push({
            fileName: file.name,
            reason: getErrorDetails(error).description,
          });
        }
      }

      return {
        transactionId,
        attemptedReceiptCount: receiptFiles.length,
        uploadFailures,
      };
    },
    onSuccess: ({ attemptedReceiptCount, uploadFailures }) => {
      form.reset({
        collectorId: '',
        collectionDate: undefined,
        items: [{ materialId: '', weight: 0, price: 0 }],
      });
      resetReceiptSelection();
      setOpen(false);

      if (attemptedReceiptCount === 0) {
        toast.success('Collection created.');
        return;
      }

      if (uploadFailures.length === 0) {
        toast.success('Collection created and receipts attached.');
        return;
      }

      const uploadedCount = attemptedReceiptCount - uploadFailures.length;
      toast.error('Collection created with receipt upload issues.', {
        description:
          `${uploadedCount} of ${attemptedReceiptCount} receipts attached. ` +
          uploadFailures.map((failure) => `${failure.fileName}: ${failure.reason}`).join(' '),
      });
    },
    onError: (error) => {
      const details = getErrorDetails(error);
      toast.error(details.message, { description: details.description });
    },
  });

  const handleReceiptChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFiles = Array.from(event.target.files ?? []);
    const validationErrors = validateReceiptFiles(nextFiles);

    if (validationErrors.length > 0) {
      setReceiptFiles([]);
      setReceiptErrors(validationErrors);
      event.target.value = '';
      return;
    }

    setReceiptFiles(nextFiles);
    setReceiptErrors([]);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          children ? (
            children
          ) : (
            <Button variant="ghost">
              <PlusIcon className="size-4" />
              <Label>Create</Label>
            </Button>
          )
        }
      />
      <DialogContent className="flex max-h-[90vh] w-full max-w-screen-md flex-col sm:max-w-screen-md">
        <DialogHeader className="shrink-0">
          <DialogTitle>Create Collection</DialogTitle>
          <DialogDescription>
            Select a collector and add one or more materials to record this
            collection.
          </DialogDescription>
        </DialogHeader>

        <form
          id="form-create-collection"
          className="flex w-full min-h-0 flex-1 flex-col gap-4 overflow-hidden"
          onSubmit={form.handleSubmit((values) => submitCollection(values))}
        >
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
            <div className="flex flex-col gap-4 overflow-y-auto pr-1">
              <Controller
                name="collectorId"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="form-create-collection-collector">
                      Collector
                    </FieldLabel>
                    <Select
                      id="form-create-collection-collector"
                      value={field.value}
                      onValueChange={(value) => field.onChange(value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a collector">
                          {(() => {
                            const collector = collectors?.find(
                              (option) => option._id === field.value
                            );
                            return collector
                              ? collector.name || collector.email || collector.phone
                              : undefined;
                          })()}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectLabel>
                            {collectors && collectors.length > 0
                              ? 'Collectors'
                              : 'There are no collectors'}
                          </SelectLabel>
                          {collectors?.map((collector) => (
                            <SelectItem
                              key={collector._id}
                              value={collector._id}
                              render={
                                <Item key={collector._id}>
                                  <ItemMedia>
                                    <Avatar>
                                      <AvatarImage src={collector.image} />
                                      <AvatarFallback>
                                        {collector.name?.charAt(0) ??
                                          collector.email?.charAt(0) ??
                                          collector.phone?.charAt(0)}
                                      </AvatarFallback>
                                    </Avatar>
                                  </ItemMedia>
                                  <ItemContent>
                                    <ItemTitle>{collector.name}</ItemTitle>
                                    <ItemDescription>
                                      {collector.email
                                        ? `${collector.phone} | ${collector.email}`
                                        : collector.phone}
                                    </ItemDescription>
                                  </ItemContent>
                                  <ItemActions>
                                    {field.value === collector._id && <CheckIcon />}
                                  </ItemActions>
                                </Item>
                              }
                            />
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />

              <Controller
                name="collectionDate"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel>Collection Date</FieldLabel>
                    <div className="flex items-center gap-2">
                      <Popover>
                        <PopoverTrigger
                          render={(props) => (
                            <Button
                              type="button"
                              variant="outline"
                              className="w-full justify-start text-left font-normal"
                              disabled={isPending}
                              {...props}
                            >
                              <CalendarIcon className="size-4" />
                              {field.value
                                ? format(field.value, 'dd/MM/yyyy')
                                : 'Select collection date'}
                            </Button>
                          )}
                        />
                        <PopoverContent align="start" className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={(date) => field.onChange(date)}
                          />
                        </PopoverContent>
                      </Popover>
                      {field.value ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => field.onChange(undefined)}
                          disabled={isPending}
                        >
                          <XIcon className="size-4" />
                        </Button>
                      ) : null}
                    </div>
                    <FieldDescription>
                      Optional. Leave blank to use the current transaction
                      timestamp.
                    </FieldDescription>
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />

              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-sm font-medium">Items</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => append({ materialId: '', weight: 0, price: 0 })}
                  >
                    <PlusIcon className="size-3" />
                    Add Item
                  </Button>
                </div>

                <div className="flex flex-col gap-3">
                  {fields.map((field, index) => (
                    <FieldGroup
                      key={field.id}
                      className="gap-2 rounded-lg border p-3"
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <Label className="text-xs text-muted-foreground">
                          Item {index + 1}
                        </Label>
                        {fields.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => remove(index)}
                          >
                            <TrashIcon className="size-3" />
                          </Button>
                        )}
                      </div>

                      <Controller
                        name={`items.${index}.materialId`}
                        control={form.control}
                        render={({ field: itemField, fieldState }) => (
                          <Field data-invalid={fieldState.invalid}>
                            <FieldLabel>Material</FieldLabel>
                            <Select
                              value={itemField.value}
                              onValueChange={(value) => itemField.onChange(value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select a material">
                                  {
                                    materials?.find(
                                      (material) => material._id === itemField.value
                                    )?.name
                                  }
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  <SelectLabel>
                                    {materials && materials.length > 0
                                      ? 'Materials'
                                      : 'No materials'}
                                  </SelectLabel>
                                  {materials?.map((material) => (
                                    <SelectItem
                                      key={material._id}
                                      value={material._id}
                                      render={
                                        <Item key={material._id}>
                                          <ItemContent>
                                            <ItemTitle>{material.name}</ItemTitle>
                                            <ItemDescription>
                                              Base price: R{material.price}/kg
                                            </ItemDescription>
                                          </ItemContent>
                                          <ItemActions>
                                            {itemField.value === material._id && (
                                              <CheckIcon />
                                            )}
                                          </ItemActions>
                                        </Item>
                                      }
                                    />
                                  ))}
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                            {fieldState.invalid && (
                              <FieldError errors={[fieldState.error]} />
                            )}
                          </Field>
                        )}
                      />

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <Controller
                          name={`items.${index}.weight`}
                          control={form.control}
                          render={({ field: itemField, fieldState }) => (
                            <Field data-invalid={fieldState.invalid}>
                              <FieldLabel>Weight (kg)</FieldLabel>
                              <Input
                                {...itemField}
                                type="number"
                                step={0.01}
                                placeholder="e.g. 10.5"
                                onChange={(event) =>
                                  itemField.onChange(event.target.valueAsNumber)
                                }
                              />
                              {fieldState.invalid && (
                                <FieldError errors={[fieldState.error]} />
                              )}
                            </Field>
                          )}
                        />
                        <Controller
                          name={`items.${index}.price`}
                          control={form.control}
                          render={({ field: itemField, fieldState }) => (
                            <Field data-invalid={fieldState.invalid}>
                              <FieldLabel>Price / kg (R)</FieldLabel>
                              <Input
                                {...itemField}
                                type="number"
                                step={0.01}
                                placeholder="e.g. 5.00"
                                onChange={(event) =>
                                  itemField.onChange(event.target.valueAsNumber)
                                }
                              />
                              {fieldState.invalid && (
                                <FieldError errors={[fieldState.error]} />
                              )}
                            </Field>
                          )}
                        />
                      </div>
                    </FieldGroup>
                  ))}
                </div>
              </div>

              <Field data-invalid={receiptErrors.length > 0}>
                <FieldLabel htmlFor="form-create-collection-receipts">
                  Receipt Images
                </FieldLabel>
                <Input
                  ref={receiptInputRef}
                  id="form-create-collection-receipts"
                  type="file"
                  accept={RECEIPT_ACCEPT}
                  multiple
                  onChange={handleReceiptChange}
                  disabled={isPending}
                  aria-invalid={receiptErrors.length > 0}
                />
                <FieldDescription>
                  Optional. Upload up to {MAX_RECEIPT_FILES} receipt images.
                  Each file must be PNG, JPEG, JPG, WEBP, or GIF and no larger
                  than {formatBytes(MAX_RECEIPT_FILE_SIZE)}.
                </FieldDescription>
                {receiptFiles.length > 0 && (
                  <div className="flex flex-col gap-2 rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <Label className="text-sm font-medium">
                        {receiptFiles.length} receipt
                        {receiptFiles.length === 1 ? '' : 's'} selected
                      </Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={resetReceiptSelection}
                        disabled={isPending}
                      >
                        <XIcon className="size-3" />
                        Clear
                      </Button>
                    </div>
                    <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                      {receiptFiles.map((file) => (
                        <div
                          key={`${file.name}-${file.lastModified}`}
                          className="flex items-center justify-between gap-3"
                        >
                          <span className="truncate">{file.name}</span>
                          <span>{formatBytes(file.size)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {receiptErrors.length > 0 && (
                  <FieldError
                    errors={receiptErrors.map((message) => ({ message }))}
                  />
                )}
              </Field>
            </div>
          </div>

          <DialogFooter className="shrink-0" showCloseButton>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2Icon className="size-4 animate-spin" />}
              {isPending ? 'Creating Collection...' : 'Create Collection'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
