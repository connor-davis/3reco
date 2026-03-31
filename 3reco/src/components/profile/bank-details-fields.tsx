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
      <div className="flex w-full h-auto justify-center">
        <Card className="relative w-full max-w-[640px] border border-primary/20 bg-linear-to-br from-primary/15 via-card to-amber-100/10 shadow-sm">
          <div className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-white/25 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-14 left-6 h-28 w-28 rounded-full bg-primary/20 blur-2xl" />

          <CardHeader className="relative pb-3">
            <CardTitle className="text-sm uppercase tracking-[0.35em] text-muted-foreground">
              3rEco payout
            </CardTitle>
            <CardDescription>
              {required
                ? 'Businesses must add bank details before completing their profile.'
                : 'Add bank details now if you would like them to appear on invoices.'}
            </CardDescription>
          </CardHeader>

          <CardContent className="relative flex min-h-52 flex-col justify-between space-y-0 pb-6">
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-muted-foreground">
              <span>{bankName ?? 'Your bank'}</span>
              <span>{accountType ?? 'Account type'}</span>
            </div>

            <div className="space-y-2">
              <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                Account number
              </div>
              <div className="font-mono text-xl tracking-[0.32em] text-foreground">
                {formatAccountNumberPreview(accountNumber)}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs uppercase tracking-[0.22em] text-muted-foreground">
              <div className="space-y-1">
                <div>Account holder</div>
                <div className="truncate text-sm font-medium tracking-[0.08em] text-foreground">
                  {accountHolderName ?? 'Your name'}
                </div>
              </div>

              <div className="space-y-1 text-right">
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
                Enter the name attached to the bank account.
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
                Enter the bank where this account is held.
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
                  Use digits only for the account number.
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
                  Branch codes should be 6 digits long.
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
                Select the type of account that should receive payment.
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
