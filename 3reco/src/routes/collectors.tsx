import BackButton from '@/components/back-button';
import {
  TypedConfirmationField,
  matchesTypedConfirmation,
} from '@/components/dialogs/typed-confirmation';
import { BankDetailsFields } from '@/components/profile/bank-details-fields';
import PageHeaderActions from '@/components/page-header-actions';
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
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
  ItemTitle,
} from '@/components/ui/item';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { bankAccountTypes } from '@/lib/bank-details';
import {
  useConvexMutation,
  useConvexPaginatedQuery,
} from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { zodResolver } from '@hookform/resolvers/zod';
import { createFileRoute } from '@tanstack/react-router';
import { ConvexError } from 'convex/values';
import { useQuery } from 'convex/react';
import {
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  UsersIcon,
} from 'lucide-react';
import { Activity, useEffect, useState } from 'react';
import {
  Controller,
  type Control,
  type UseFormReturn,
  useForm,
} from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod/v4';

export const Route = createFileRoute('/collectors')({
  component: RouteComponent,
});

const provinceOptions = [
  'Eastern Cape',
  'Free State',
  'Gauteng',
  'KwaZulu-Natal',
  'Limpopo',
  'Mpumalanga',
  'Northern Cape',
  'North West',
  'Western Cape',
] as const;

const optionalTrimmedValue = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => {
    if (typeof value !== 'string') return value;

    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  }, schema.optional());

const optionalAreaCode = z.preprocess((value) => {
  if (typeof value !== 'string') return value;

  const trimmed = value.trim();
  if (trimmed === '') return undefined;

  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? value : parsed;
}, z.number().int().min(1, 'Please provide an area code.').optional());

const collectorSchema = z
  .object({
    name: z.string({ error: 'Please provide a collector name.' }).min(1),
    email: optionalTrimmedValue(
      z.email({ error: 'Please provide a valid email address.' })
    ),
    phone: z
      .string({ error: 'Please provide a phone number.' })
      .regex(
        /^(0\d{9}|\+27\d{9})$/g,
        'Invalid South African phone number format (+27 or 0...)'
      ),
    bankAccountHolderName: optionalTrimmedValue(
      z.string().min(2, 'Please provide the account holder name.')
    ),
    bankName: optionalTrimmedValue(
      z.string().min(2, 'Please provide the bank name.')
    ),
    bankAccountNumber: optionalTrimmedValue(
      z
        .string()
        .regex(/^\d{6,20}$/, 'Account numbers must contain 6 to 20 digits.')
    ),
    bankBranchCode: optionalTrimmedValue(
      z.string().regex(/^\d{6}$/, 'Branch codes must contain 6 digits.')
    ),
    bankAccountType: optionalTrimmedValue(
      z.enum(bankAccountTypes, {
        error: 'Please select an account type.',
      })
    ),
    streetAddress: optionalTrimmedValue(
      z.string().min(2, 'Please provide a street address.')
    ),
    city: optionalTrimmedValue(z.string().min(2, 'Please provide a city.')),
    areaCode: optionalAreaCode,
    province: optionalTrimmedValue(
      z.enum(provinceOptions, {
        error: 'Please provide a province.',
      })
    ),
  })
  .superRefine((values, context) => {
    const bankFields: Array<string | undefined> = [
      values.bankAccountHolderName,
      values.bankName,
      values.bankAccountNumber,
      values.bankBranchCode,
      values.bankAccountType,
    ];
    const providedCount = bankFields.filter(
      (value) => typeof value === 'string' && value.trim().length > 0
    ).length;

    if (providedCount === 0 || providedCount === bankFields.length) {
      return;
    }

    if (!values.bankAccountHolderName) {
      context.addIssue({
        code: 'custom',
        path: ['bankAccountHolderName'],
        message: 'Please provide the account holder name.',
      });
    }
    if (!values.bankName) {
      context.addIssue({
        code: 'custom',
        path: ['bankName'],
        message: 'Please provide the bank name.',
      });
    }
    if (!values.bankAccountNumber) {
      context.addIssue({
        code: 'custom',
        path: ['bankAccountNumber'],
        message: 'Please provide the account number.',
      });
    }
    if (!values.bankBranchCode) {
      context.addIssue({
        code: 'custom',
        path: ['bankBranchCode'],
        message: 'Please provide the branch code.',
      });
    }
    if (!values.bankAccountType) {
      context.addIssue({
        code: 'custom',
        path: ['bankAccountType'],
        message: 'Please provide the account type.',
      });
    }
  });

type CollectorFormValues = z.output<typeof collectorSchema>;
type CollectorFormInputValues = z.input<typeof collectorSchema>;

function CollectorLocationFields({
  control,
  idPrefix,
}: {
  control: Control<CollectorFormInputValues, undefined, CollectorFormValues>;
  idPrefix: string;
}) {
  return (
    <FieldGroup className="gap-3">
      <Controller
        name="streetAddress"
        control={control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={`${idPrefix}-street-address`}>
              Street Address
            </FieldLabel>
            <Input
              {...field}
              value={typeof field.value === 'string' ? field.value : ''}
              id={`${idPrefix}-street-address`}
              placeholder="Street address"
            />
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />

      <div className="grid gap-3 md:grid-cols-2">
        <Controller
          name="city"
          control={control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${idPrefix}-city`}>City</FieldLabel>
              <Input
                {...field}
                value={typeof field.value === 'string' ? field.value : ''}
                id={`${idPrefix}-city`}
                placeholder="City"
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <Controller
          name="areaCode"
          control={control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${idPrefix}-area-code`}>
                Area Code
              </FieldLabel>
              <Input
                value={field.value?.toString() ?? ''}
                id={`${idPrefix}-area-code`}
                placeholder="Area code"
                inputMode="numeric"
                onChange={(event) => field.onChange(event.target.value)}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
      </div>

      <Controller
        name="province"
        control={control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={`${idPrefix}-province`}>Province</FieldLabel>
            <Select
              value={typeof field.value === 'string' ? field.value : undefined}
              onValueChange={(value) => field.onChange(value)}
            >
              <SelectTrigger id={`${idPrefix}-province`}>
                <SelectValue placeholder="Select a province" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Provinces</SelectLabel>
                  {provinceOptions.map((province) => (
                    <SelectItem key={province} value={province}>
                      {province}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
    </FieldGroup>
  );
}

function CollectorFormFields({
  form,
  idPrefix,
}: {
  form: UseFormReturn<CollectorFormInputValues, undefined, CollectorFormValues>;
  idPrefix: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <FieldGroup className="gap-3">
        <Controller
          name="name"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${idPrefix}-name`}>Name</FieldLabel>
              <Input
                {...field}
                id={`${idPrefix}-name`}
                placeholder="Collector name"
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              <FieldDescription>
                Use the collector&apos;s full name or operating name.
              </FieldDescription>
            </Field>
          )}
        />

        <Controller
          name="email"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${idPrefix}-email`}>Email</FieldLabel>
              <Input
                {...field}
                value={typeof field.value === 'string' ? field.value : ''}
                id={`${idPrefix}-email`}
                type="email"
                placeholder="collector@example.com"
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              <FieldDescription>
                Optional. Used for admin/staff removal confirmation when
                available.
              </FieldDescription>
            </Field>
          )}
        />

        <Controller
          name="phone"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${idPrefix}-phone`}>
                Phone number
              </FieldLabel>
              <Input
                {...field}
                id={`${idPrefix}-phone`}
                placeholder="0XXXXXXXXX or +27XXXXXXXXX"
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              <FieldDescription>
                This phone number is used for public collector stats lookup.
              </FieldDescription>
            </Field>
          )}
        />
      </FieldGroup>

      <div className="space-y-2">
        <Label>Bank details</Label>
        <p className="text-sm text-muted-foreground">
          Optional. If you add one bank field, complete them all.
        </p>
        <BankDetailsFields
          control={form.control}
          idPrefix={`${idPrefix}-bank`}
        />
      </div>

      <div className="space-y-2">
        <Label>Location details</Label>
        <p className="text-sm text-muted-foreground">
          Optional address details for operations and future payout workflows.
        </p>
        <CollectorLocationFields
          control={form.control}
          idPrefix={`${idPrefix}-location`}
        />
      </div>
    </div>
  );
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

function CreateCollectorDialog() {
  const [open, setOpen] = useState(false);
  const createCollector = useConvexMutation(api.collectors.create);
  const form = useForm<
    CollectorFormInputValues,
    undefined,
    CollectorFormValues
  >({
    resolver: zodResolver(collectorSchema),
    defaultValues: {
      name: '',
      email: undefined,
      phone: '',
      streetAddress: undefined,
      city: undefined,
      areaCode: undefined,
      province: undefined,
      bankAccountHolderName: undefined,
      bankName: undefined,
      bankAccountNumber: undefined,
      bankBranchCode: undefined,
      bankAccountType: undefined,
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="w-full" />}>
        <PlusIcon />
        Add Collector
      </DialogTrigger>
      <DialogContent className="w-full max-w-screen-md flex max-h-[90vh] flex-col sm:max-w-screen-md">
        <DialogHeader className="shrink-0">
          <DialogTitle>Add collector</DialogTitle>
          <DialogDescription>
            Save a collector's details so you can use them in future
            collections.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden"
          onSubmit={form.handleSubmit((values) =>
            toast.promise(createCollector(values), {
              loading: 'Adding collector...',
              success: () => {
                form.reset();
                setOpen(false);
                return 'Collector added.';
              },
              error: getErrorDetails,
            })
          )}
        >
          <div className="flex-1 overflow-y-auto pr-1">
            <CollectorFormFields form={form} idPrefix="create-collector" />
          </div>
          <DialogFooter className="shrink-0" showCloseButton>
            <Button type="submit">Add collector</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditCollectorDialog({
  collector,
}: {
  collector: (typeof api.collectors.listManaged._returnType)['page'][number];
}) {
  const [open, setOpen] = useState(false);
  const updateCollector = useConvexMutation(api.collectors.update);
  const form = useForm<
    CollectorFormInputValues,
    undefined,
    CollectorFormValues
  >({
    resolver: zodResolver(collectorSchema),
    defaultValues: {
      name: collector.name,
      email: collector.email,
      phone: collector.phone,
      streetAddress: collector.streetAddress,
      city: collector.city,
      areaCode: collector.areaCode,
      province: collector.province,
      bankAccountHolderName: collector.bankAccountHolderName,
      bankName: collector.bankName,
      bankAccountNumber: collector.bankAccountNumber,
      bankBranchCode: collector.bankBranchCode,
      bankAccountType: collector.bankAccountType,
    },
  });

  useEffect(() => {
    form.reset({
      name: collector.name,
      email: collector.email,
      phone: collector.phone,
      streetAddress: collector.streetAddress,
      city: collector.city,
      areaCode: collector.areaCode,
      province: collector.province,
      bankAccountHolderName: collector.bankAccountHolderName,
      bankName: collector.bankName,
      bankAccountNumber: collector.bankAccountNumber,
      bankBranchCode: collector.bankBranchCode,
      bankAccountType: collector.bankAccountType,
    });
  }, [collector, form]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="icon-sm" />}>
        <PencilIcon />
      </DialogTrigger>
      <DialogContent className="w-full max-w-screen-md flex max-h-[90vh] flex-col sm:max-w-screen-md">
        <DialogHeader className="shrink-0">
          <DialogTitle>Edit collector</DialogTitle>
          <DialogDescription>
            Update managed collector details, including optional bank and
            location information.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden"
          onSubmit={form.handleSubmit((values) =>
            toast.promise(
              updateCollector({
                _id: collector._id as Id<'collectors'>,
                ...values,
              }),
              {
                loading: 'Updating collector...',
                success: () => {
                  setOpen(false);
                  return 'Collector updated.';
                },
                error: getErrorDetails,
              }
            )
          )}
        >
          <div className="flex-1 overflow-y-auto pr-1">
            <CollectorFormFields
              form={form}
              idPrefix={`edit-collector-${collector._id}`}
            />
          </div>
          <DialogFooter className="shrink-0" showCloseButton>
            <Button type="submit">Save collector</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RemoveCollectorDialog({
  collectorId,
  collectorName,
  confirmationLabel,
  confirmationValue,
}: {
  collectorId: Id<'collectors'>;
  collectorName: string;
  confirmationLabel: string;
  confirmationValue: string;
}) {
  const [open, setOpen] = useState(false);
  const [confirmationInput, setConfirmationInput] = useState('');
  const removeCollector = useConvexMutation(api.collectors.remove);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setConfirmationInput('');
        }
      }}
    >
      <DialogTrigger render={<Button variant="destructive" size="icon-sm" />}>
        <Trash2Icon />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove collector</DialogTitle>
          <DialogDescription>
            Enter <strong>{confirmationValue}</strong> ({confirmationLabel}) to
            confirm removal of <strong>{collectorName}</strong>.
          </DialogDescription>
        </DialogHeader>
        <TypedConfirmationField
          expectedValue={confirmationValue}
          confirmationLabel={confirmationLabel}
          value={confirmationInput}
          onChange={setConfirmationInput}
        />
        <DialogFooter showCloseButton>
          <Button
            variant="destructive"
            disabled={
              !matchesTypedConfirmation(confirmationInput, confirmationValue)
            }
            onClick={() =>
              toast.promise(
                removeCollector({
                  _id: collectorId,
                  confirmationValue: confirmationInput,
                }),
                {
                  loading: 'Removing collector...',
                  success: () => {
                    setOpen(false);
                    setConfirmationInput('');
                    return 'Collector removed.';
                  },
                  error: getErrorDetails,
                }
              )
            }
          >
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RouteComponent() {
  const {
    results: collectors,
    isLoading,
    status,
    loadMore,
  } = useConvexPaginatedQuery(
    api.collectors.listManaged,
    {},
    {
      initialNumItems: 50,
    }
  );
  const currentUser = useQuery(api.users.currentUser);
  const [search, setSearch] = useState('');
  const canRemove =
    currentUser?.type === 'admin' || currentUser?.type === 'staff';

  const filtered = collectors?.filter((collector) => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return true;
    }

    return (
      collector.name.toLowerCase().includes(query) ||
      collector.email?.toLowerCase().includes(query) ||
      collector.phone.toLowerCase().includes(query)
    );
  });

  return (
    <div className="flex flex-col w-full h-full gap-3 overflow-hidden">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <BackButton />
          <Label className="text-lg">Collectors</Label>
        </div>
        <div className="flex w-full items-center justify-end gap-2 sm:ml-auto sm:w-auto sm:gap-3">
          <PageHeaderActions
            title="Collectors"
            description="Search or add collectors."
          >
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search collectors..."
                className="pl-9 w-full"
              />
            </div>
            <CreateCollectorDialog />
          </PageHeaderActions>
        </div>
      </div>

      <Activity mode={isLoading ? 'visible' : 'hidden'}>
        <div className="flex flex-col w-full h-full items-center justify-center">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <UsersIcon />
              </EmptyMedia>
              <EmptyTitle>Loading collectors...</EmptyTitle>
            </EmptyHeader>
          </Empty>
        </div>
      </Activity>

      <Activity mode={isLoading ? 'hidden' : 'visible'}>
        {filtered && filtered.length === 0 && (
          <div className="flex flex-col w-full h-full items-center justify-center">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <UsersIcon />
                </EmptyMedia>
                <EmptyTitle>
                  {search ? 'No collectors found' : 'No collectors yet'}
                </EmptyTitle>
                <EmptyDescription>
                  {search
                    ? 'Try adjusting your search.'
                    : 'Add a collector to get started.'}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        )}

        {filtered && filtered.length > 0 && (
          <div className="flex flex-col w-full h-full overflow-y-auto gap-3">
            {filtered.map((collector) => (
              <Item key={collector._id} variant="backgroundOutline">
                <ItemContent>
                  <ItemTitle>{collector.name}</ItemTitle>
                  <ItemDescription>
                    {collector.email
                      ? `${collector.email} · ${collector.phone}`
                      : collector.phone}
                  </ItemDescription>
                </ItemContent>
                <ItemActions className="flex-wrap justify-end">
                  <EditCollectorDialog collector={collector} />
                  {canRemove && (
                    <RemoveCollectorDialog
                      collectorId={collector._id}
                      collectorName={collector.name}
                      confirmationLabel={
                        collector.email ? 'email' : 'phone number'
                      }
                      confirmationValue={collector.email ?? collector.phone}
                    />
                  )}
                </ItemActions>
              </Item>
            ))}

            <Activity mode={status === 'CanLoadMore' ? 'visible' : 'hidden'}>
              <Button variant="outline" onClick={() => loadMore(50)}>
                Load More
              </Button>
            </Activity>
          </div>
        )}
      </Activity>
    </div>
  );
}
