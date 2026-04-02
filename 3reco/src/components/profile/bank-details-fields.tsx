import {
  type Control,
  Controller,
  type FieldPath,
  type FieldValues,
  useWatch,
} from 'react-hook-form';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
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

type BankDetailsFieldsProps<T extends FieldValues> = {
  control: Control<T, undefined, FieldValues | undefined>;
  idPrefix: string;
  required?: boolean;
};

export function BankDetailsFields<T extends FieldValues>({
  control,
  idPrefix,
  required = false,
}: BankDetailsFieldsProps<T>) {
  const accountHolderName = useWatch({
    control,
    name: 'bankAccountHolderName' as FieldPath<T>,
  }) as string | undefined;
  const bankName = useWatch({
    control,
    name: 'bankName' as FieldPath<T>,
  }) as string | undefined;
  const accountNumber = useWatch({
    control,
    name: 'bankAccountNumber' as FieldPath<T>,
  }) as string | undefined;
  const branchCode = useWatch({
    control,
    name: 'bankBranchCode' as FieldPath<T>,
  }) as string | undefined;
  const accountType = useWatch({
    control,
    name: 'bankAccountType' as FieldPath<T>,
  }) as string | undefined;

  return (
    <div className="space-y-4">
      <div className="flex h-auto w-full justify-center px-1 sm:px-0">
        <Card className="relative w-full max-w-[640px] border border-primary/20 bg-linear-to-br from-card via-card to-primary/5 shadow-[var(--shadow-soft)]">

          <CardHeader className="relative pb-3">
            <CardTitle className="text-sm uppercase tracking-[0.35em] text-muted-foreground">
              3rEco payout
            </CardTitle>
            <CardDescription>
              {required
                ? 'Add bank details to finish setting up your business profile.'
                : 'Add bank details if you want them to show on invoices.'}
            </CardDescription>
          </CardHeader>

          <CardContent className="relative flex min-h-48 flex-col justify-between space-y-0 pb-6 sm:min-h-52">
            <div className="flex flex-col gap-1 text-xs uppercase tracking-[0.3em] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>{bankName ?? 'Your bank'}</span>
              <span>{accountType ?? 'Account type'}</span>
            </div>

            <div className="space-y-2">
              <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                Account number
              </div>
              <div className="break-all font-mono text-lg tracking-[0.24em] text-foreground sm:text-xl sm:tracking-[0.32em]">
                {formatAccountNumberPreview(accountNumber)}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 text-xs uppercase tracking-[0.22em] text-muted-foreground sm:grid-cols-2 sm:gap-4">
              <div className="space-y-1">
                <div>Account holder</div>
                <div className="truncate text-sm font-medium tracking-[0.08em] text-foreground">
                  {accountHolderName ?? 'Your name'}
                </div>
              </div>

              <div className="space-y-1 sm:text-right">
                <div>Branch code</div>
                <div className="font-mono text-sm font-medium tracking-[0.18em] text-foreground">
                  {branchCode ?? '000000'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <FieldGroup className="gap-3">
        <Controller
          name={'bankAccountHolderName' as FieldPath<T>}
          control={control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${idPrefix}-bank-account-holder-name`}>
                Account Holder Name
              </FieldLabel>
              <Input
                {...field}
                value={field.value ?? ''}
                id={`${idPrefix}-bank-account-holder-name`}
                aria-invalid={fieldState.invalid}
                placeholder="Account Holder Name"
                autoComplete="name"
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              <FieldDescription>
                Enter the name on the account.
              </FieldDescription>
            </Field>
          )}
        />

        <Controller
          name={'bankName' as FieldPath<T>}
          control={control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${idPrefix}-bank-name`}>
                Bank Name
              </FieldLabel>
              <Input
                {...field}
                value={field.value ?? ''}
                id={`${idPrefix}-bank-name`}
                aria-invalid={fieldState.invalid}
                placeholder="Bank Name"
                autoComplete="organization"
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              <FieldDescription>
                Enter the bank name.
              </FieldDescription>
            </Field>
          )}
        />

        <div className="grid gap-3 md:grid-cols-2">
          <Controller
            name={'bankAccountNumber' as FieldPath<T>}
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={`${idPrefix}-bank-account-number`}>
                  Account Number
                </FieldLabel>
                <Input
                  {...field}
                  value={field.value ?? ''}
                  id={`${idPrefix}-bank-account-number`}
                  aria-invalid={fieldState.invalid}
                  placeholder="Account Number"
                  inputMode="numeric"
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
                <FieldDescription>
                  Numbers only.
                </FieldDescription>
              </Field>
            )}
          />

          <Controller
            name={'bankBranchCode' as FieldPath<T>}
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={`${idPrefix}-bank-branch-code`}>
                  Branch Code
                </FieldLabel>
                <Input
                  {...field}
                  value={field.value ?? ''}
                  id={`${idPrefix}-bank-branch-code`}
                  aria-invalid={fieldState.invalid}
                  placeholder="Branch Code"
                  inputMode="numeric"
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
                <FieldDescription>
                  Your bank's 6-digit branch code.
                </FieldDescription>
              </Field>
            )}
          />
        </div>

        <Controller
          name={'bankAccountType' as FieldPath<T>}
          control={control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${idPrefix}-bank-account-type`}>
                Account Type
              </FieldLabel>
              <Select
                value={field.value}
                onValueChange={(value) => field.onChange(value)}
              >
                <SelectTrigger id={`${idPrefix}-bank-account-type`}>
                  <SelectValue placeholder="Select an account type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Account Types</SelectLabel>
                    {bankAccountTypes.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              <FieldDescription>
                Choose the account type for payments.
              </FieldDescription>
            </Field>
          )}
        />
      </FieldGroup>
    </div>
  );
}

function formatAccountNumberPreview(value: string | undefined) {
  const digits = value?.replace(/\D/g, '') ?? '';

  if (!digits) {
    return '•••• •••• ••••';
  }

  const masked =
    digits.length > 4
      ? `${'•'.repeat(digits.length - 4)}${digits.slice(-4)}`
      : digits;
  return masked.match(/.{1,4}/g)?.join(' ') ?? masked;
}
