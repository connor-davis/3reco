import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
  useComboboxAnchor,
} from '@/components/ui/combobox';
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
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { parseCollectionDayInput } from '@/lib/transactions';
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
import {
  type ChangeEvent,
  type ReactElement,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod/v4';

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
    errors.push(
      `You can upload up to ${MAX_RECEIPT_FILES} receipt images at a time.`
    );
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

function matchesSearch(
  values: Array<string | undefined>,
  search: string | undefined
) {
  const query = search?.trim().toLowerCase();

  if (!query) {
    return true;
  }

  return values.some((value) => value?.toLowerCase().includes(query));
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
  businessId: z.string().optional(),
  collectionDate: z.date().optional(),
  items: z
    .array(itemSchema)
    .min(1, { error: 'At least one item is required.' }),
});

const searchableComboboxTriggerClassName =
  "flex h-9 w-full items-center justify-between gap-1.5 rounded-4xl border border-input bg-input/30 px-3 py-2 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

type SearchableComboboxProps<T extends { _id: string }> = {
  triggerId: string;
  value: string | undefined;
  items: T[] | undefined;
  searchValue: string;
  onSearchValueChange: (value: string) => void;
  onValueChange: (value: string | undefined) => void;
  placeholder: string;
  searchPlaceholder: string;
  groupLabel: string;
  emptyItemsLabel: string;
  emptySearchLabel: string;
  getItemLabel: (item: T) => string;
  getSearchValues: (item: T) => Array<string | undefined>;
  renderItem: (item: T, selected: boolean) => ReactElement;
  invalid?: boolean;
  disabled?: boolean;
};

function SearchableCombobox<T extends { _id: string }>({
  triggerId,
  value,
  items,
  searchValue,
  onSearchValueChange,
  onValueChange,
  placeholder,
  searchPlaceholder,
  emptyItemsLabel,
  emptySearchLabel,
  getItemLabel,
  getSearchValues,
  renderItem,
  invalid = false,
  disabled = false,
}: SearchableComboboxProps<T>) {
  const anchorRef = useComboboxAnchor();
  const options = items ?? [];
  const selectedItem = options.find((item) => item._id === value) ?? null;
  const hasItems = options.length > 0;

  return (
    <Combobox
      items={options}
      value={selectedItem}
      inputValue={searchValue}
      disabled={disabled}
      onInputValueChange={(nextValue) => onSearchValueChange(nextValue)}
      onOpenChange={(open) => {
        if (!open && searchValue) {
          onSearchValueChange('');
        }
      }}
      onValueChange={(nextValue) => {
        onValueChange(nextValue?._id);
        if (searchValue) {
          onSearchValueChange('');
        }
      }}
      itemToStringLabel={getItemLabel}
      itemToStringValue={(item) => item._id}
      isItemEqualToValue={(item, currentValue) => item._id === currentValue._id}
      filter={(item, query) => matchesSearch(getSearchValues(item), query)}
    >
      <div ref={anchorRef} className="w-full">
        <ComboboxTrigger
          id={triggerId}
          aria-invalid={invalid || undefined}
          className={searchableComboboxTriggerClassName}
        >
          <ComboboxValue placeholder={placeholder} />
        </ComboboxTrigger>
      </div>
      <ComboboxContent
        align="start"
        anchor={anchorRef}
        initialFocus={false}
        className="flex flex-col p-3 gap-3"
      >
        {!hasItems && <ComboboxEmpty>{emptyItemsLabel}</ComboboxEmpty>}
        {hasItems ? (
          <ComboboxInput
            aria-label={searchPlaceholder}
            placeholder={searchPlaceholder}
            className="w-full"
          />
        ) : null}
        {hasItems ? <ComboboxEmpty>{emptySearchLabel}</ComboboxEmpty> : null}
        {hasItems ? (
          <ComboboxList>
            {(item: T) => (
              <ComboboxItem
                key={item._id}
                value={item}
                render={renderItem(item, value === item._id)}
              />
            )}
          </ComboboxList>
        ) : null}
      </ComboboxContent>
    </Combobox>
  );
}

export default function CreateCollectionDialog({
  children,
}: {
  children?: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
  const [receiptErrors, setReceiptErrors] = useState<string[]>([]);
  const [businessSearch, setBusinessSearch] = useState('');
  const [collectorSearch, setCollectorSearch] = useState('');
  const [materialSearches, setMaterialSearches] = useState<
    Record<number, string>
  >({});

  const materials = useConvexQuery(api.materials.list, {});
  const collectors = useConvexQuery(api.collectors.listForSelection, {});
  const currentUser = useConvexQuery(api.users.currentUser);
  const businesses = useConvexQuery(api.users.listBusinesses, {});
  const canSelectBusiness =
    currentUser?.role === 'admin' || currentUser?.role === 'staff';

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
      businessId: undefined,
      collectionDate: undefined,
      items: [{ materialId: '', weight: 0, price: 0 }],
    },
  });

  useEffect(() => {
    if (currentUser?.role === 'business') {
      form.setValue('businessId', currentUser._id, {
        shouldDirty: false,
        shouldTouch: false,
      });
      return;
    }

    if (currentUser?.role === 'admin' || currentUser?.role === 'staff') {
      return;
    }

    form.setValue('businessId', undefined, {
      shouldDirty: false,
      shouldTouch: false,
    });
  }, [currentUser, form]);

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

      if (canSelectBusiness && !values.businessId) {
        form.setError('businessId', {
          message: 'Please select the business for this collection.',
        });
        throw new Error('Please select the business for this collection.');
      }

      const { transactionId } = await createCollection({
        collectorId: values.collectorId as Id<'collectors'>,
        businessId: values.businessId as Id<'users'> | undefined,
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
        businessId:
          currentUser?.role === 'business' ? currentUser._id : undefined,
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
          uploadFailures
            .map((failure) => `${failure.fileName}: ${failure.reason}`)
            .join(' '),
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
            Select a collector and add items.
          </DialogDescription>
        </DialogHeader>

        <form
          id="form-create-collection"
          className="flex w-full min-h-0 flex-1 flex-col gap-4 overflow-hidden"
          onSubmit={form.handleSubmit((values) => submitCollection(values))}
        >
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
            <div className="flex flex-col gap-4 overflow-y-auto pr-1">
              {canSelectBusiness ? (
                <Controller
                  name="businessId"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="form-create-collection-business">
                        Business
                      </FieldLabel>
                      <SearchableCombobox
                        triggerId="form-create-collection-business"
                        value={field.value}
                        items={businesses}
                        searchValue={businessSearch}
                        onSearchValueChange={setBusinessSearch}
                        onValueChange={(nextValue) => field.onChange(nextValue)}
                        placeholder="Select a business"
                        searchPlaceholder="Search businesses..."
                        groupLabel="Businesses"
                        emptyItemsLabel="There are no businesses"
                        emptySearchLabel="No businesses match your search."
                        getItemLabel={(business) =>
                          business.businessName ||
                          business.name ||
                          business.email ||
                          business.phone ||
                          ''
                        }
                        getSearchValues={(business) => [
                          business.businessName,
                          business.name,
                          business.email,
                          business.phone,
                        ]}
                        renderItem={(business, selected) => (
                          <Item key={business._id}>
                            <ItemMedia>
                              <Avatar>
                                <AvatarImage src={business.image} />
                                <AvatarFallback>
                                  {business.businessName?.charAt(0) ??
                                    business.email?.charAt(0) ??
                                    business.phone?.charAt(0) ??
                                    business.name?.charAt(0)}
                                </AvatarFallback>
                              </Avatar>
                            </ItemMedia>
                            <ItemContent>
                              <ItemTitle>
                                {business.businessName ||
                                  business.name ||
                                  business.email}
                              </ItemTitle>
                              <ItemDescription>
                                {business.email
                                  ? `${business.phone ?? ''}${business.phone ? ' | ' : ''}${business.email}`
                                  : business.phone}
                              </ItemDescription>
                            </ItemContent>
                            <ItemActions>
                              {selected ? <CheckIcon /> : null}
                            </ItemActions>
                          </Item>
                        )}
                        invalid={fieldState.invalid}
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                      <FieldDescription>
                        Choose which business should receive this collection.
                      </FieldDescription>
                    </Field>
                  )}
                />
              ) : null}

              <Controller
                name="collectorId"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="form-create-collection-collector">
                      Collector
                    </FieldLabel>
                    <SearchableCombobox
                      triggerId="form-create-collection-collector"
                      value={field.value}
                      items={collectors}
                      searchValue={collectorSearch}
                      onSearchValueChange={setCollectorSearch}
                      onValueChange={(nextValue) =>
                        field.onChange(nextValue ?? '')
                      }
                      placeholder="Select a collector"
                      searchPlaceholder="Search collectors..."
                      groupLabel="Collectors"
                      emptyItemsLabel="There are no collectors"
                      emptySearchLabel="No collectors match your search."
                      getItemLabel={(collector) =>
                        collector.name ||
                        collector.email ||
                        collector.phone ||
                        ''
                      }
                      getSearchValues={(collector) => [
                        collector.name,
                        collector.email,
                        collector.phone,
                      ]}
                      renderItem={(collector, selected) => (
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
                            {selected ? <CheckIcon /> : null}
                          </ItemActions>
                        </Item>
                      )}
                      invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                    <FieldDescription>
                      Choose the collector for this collection.
                    </FieldDescription>
                  </Field>
                )}
              />

              <Controller
                name="collectionDate"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel>Collection Date</FieldLabel>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                      <Popover>
                        <PopoverTrigger
                          render={(props) => (
                            <Button
                              type="button"
                              variant="outline"
                              className="min-w-0 w-full justify-start gap-2 text-left font-normal"
                              disabled={isPending}
                              {...props}
                            >
                              <CalendarIcon className="size-4 shrink-0" />
                              <span className="truncate">
                                {field.value
                                  ? format(field.value, 'dd/MM/yyyy')
                                  : 'Select collection date'}
                              </span>
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
                      Optional. Uses the current time if left blank.
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
                    onClick={() =>
                      append({ materialId: '', weight: 0, price: 0 })
                    }
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
                            <SearchableCombobox
                              triggerId={`form-create-collection-material-${index}`}
                              value={itemField.value}
                              items={materials}
                              searchValue={materialSearches[index] ?? ''}
                              onSearchValueChange={(nextValue) =>
                                setMaterialSearches((current) => ({
                                  ...current,
                                  [index]: nextValue,
                                }))
                              }
                              onValueChange={(nextValue) =>
                                itemField.onChange(nextValue ?? '')
                              }
                              placeholder="Select a material"
                              searchPlaceholder="Search materials..."
                              groupLabel="Materials"
                              emptyItemsLabel="No materials"
                              emptySearchLabel="No materials match your search."
                              getItemLabel={(material) => material.name}
                              getSearchValues={(material) => [material.name]}
                              renderItem={(material, selected) => (
                                <Item key={material._id}>
                                  <ItemContent>
                                    <ItemTitle>{material.name}</ItemTitle>
                                    <ItemDescription>
                                      Base price: R{material.price}/kg
                                    </ItemDescription>
                                  </ItemContent>
                                  <ItemActions>
                                    {selected ? <CheckIcon /> : null}
                                  </ItemActions>
                                </Item>
                              )}
                              invalid={fieldState.invalid}
                            />
                            {fieldState.invalid && (
                              <FieldError errors={[fieldState.error]} />
                            )}
                            <FieldDescription>
                              Choose the material that was collected.
                            </FieldDescription>
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
                              <FieldDescription>
                                Enter the collected weight in kilograms.
                              </FieldDescription>
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
                              <FieldDescription>
                                Enter the price paid per kilogram.
                              </FieldDescription>
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
