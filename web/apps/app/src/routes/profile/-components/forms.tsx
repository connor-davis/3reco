import type { ReactNode } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Controller,
  useForm,
  type FieldValues,
  type UseFormReturn,
} from 'react-hook-form';
import { toast } from 'sonner';
import { SelectField, TextField } from '@/components/form-fields';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { banks, provinces, walletProviders } from '@/lib/data/people';
import { useMock, useProfile } from '@/lib/mock/hooks';
import type { Profile } from '@/lib/types';
import {
  bankSchema,
  businessSchema,
  locationSchema,
  personalSchema,
  walletSchema,
  type BankValues,
  type BusinessValues,
  type LocationValues,
  type PersonalValues,
  type WalletValues,
} from './schemas';

/** Copies just the named fields out of the profile for a form's defaults. */
function pick<K extends keyof Profile>(profile: Profile, keys: K[]) {
  return Object.fromEntries(keys.map((key) => [key, profile[key]])) as Pick<
    Profile,
    K
  >;
}

type FormShellProps<T extends FieldValues> = {
  form: UseFormReturn<T>;
  // Writes the saved values into the person's profile record.
  onSave: (values: T) => void;
  children: ReactNode;
};

/** Cancel and "Save changes" under every profile form. */
function FormShell<T extends FieldValues>({
  form,
  onSave,
  children,
}: FormShellProps<T>) {
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={form.handleSubmit((values) => {
        onSave(values);
        form.reset(values);
        toast.success('Changes saved.');
      })}
    >
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => form.reset()}>
          Cancel
        </Button>
        <Button type="submit">Save changes</Button>
      </div>
    </form>
  );
}

export function PersonalForm() {
  const { profile, save } = useProfile();
  const form = useForm<PersonalValues>({
    resolver: zodResolver(personalSchema),
    defaultValues: pick(profile, [
      'firstName',
      'lastName',
      'idNumber',
      'phone',
    ]),
  });
  const { control } = form;

  return (
    <FormShell form={form} onSave={save}>
      <TextField
        control={control}
        name="firstName"
        label="First name"
        autoComplete="given-name"
      />
      <TextField
        control={control}
        name="lastName"
        label="Last name"
        autoComplete="family-name"
      />
      <TextField
        control={control}
        name="idNumber"
        label="South African ID"
        inputMode="numeric"
      />
      <TextField
        control={control}
        name="phone"
        label="Phone number"
        type="tel"
      />
    </FormShell>
  );
}

export function BusinessForm() {
  const { profile, save } = useProfile();
  const form = useForm<BusinessValues>({
    resolver: zodResolver(businessSchema),
    defaultValues: pick(profile, ['businessName', 'registration']),
  });
  const { control } = form;

  return (
    <FormShell form={form} onSave={save}>
      <TextField control={control} name="businessName" label="Business name" />
      <TextField
        control={control}
        name="registration"
        label="Registration number"
      />
    </FormShell>
  );
}

function BankForm() {
  const { profile, save } = useProfile();
  const form = useForm<BankValues>({
    resolver: zodResolver(bankSchema),
    defaultValues: pick(profile, [
      'holder',
      'bank',
      'accountType',
      'accountNumber',
      'branchCode',
    ]),
  });
  const { control } = form;

  return (
    <FormShell
      form={form}
      onSave={(values) => save({ ...values, payoutMethod: 'bank' })}
    >
      <TextField control={control} name="holder" label="Account holder" />
      <SelectField control={control} name="bank" label="Bank" options={banks} />
      <SelectField
        control={control}
        name="accountType"
        label="Account type"
        options={['Business', 'Savings', 'Cheque']}
      />
      <TextField
        control={control}
        name="accountNumber"
        label="Account number"
        inputMode="numeric"
      />
      <TextField
        control={control}
        name="branchCode"
        label="Branch code"
        inputMode="numeric"
      />
    </FormShell>
  );
}

function WalletForm() {
  const { profile, save } = useProfile();
  const form = useForm<WalletValues>({
    resolver: zodResolver(walletSchema),
    defaultValues: pick(profile, ['walletProvider', 'walletPhone']),
  });
  const { control } = form;

  return (
    <FormShell
      form={form}
      onSave={(values) => save({ ...values, payoutMethod: 'ewallet' })}
    >
      <SelectField
        control={control}
        name="walletProvider"
        label="Wallet provider"
        options={walletProviders}
      />
      <TextField
        control={control}
        name="walletPhone"
        label="Wallet phone number"
        type="tel"
      />
    </FormShell>
  );
}

/** Collectors choose bank or e-wallet. Businesses only have a bank. */
export function PayoutForm() {
  const { role } = useMock();
  const { profile } = useProfile();
  const form = useForm<{ method: 'bank' | 'ewallet' }>({
    defaultValues: { method: profile.payoutMethod },
  });
  const method = form.watch('method');

  if (role !== 'collector') return <BankForm />;

  return (
    <div className="space-y-6">
      <Controller
        control={form.control}
        name="method"
        render={({ field }) => (
          <Field>
            <FieldLabel id="payout-method-label">Payout method</FieldLabel>
            <RadioGroup
              value={field.value}
              onValueChange={field.onChange}
              aria-labelledby="payout-method-label"
              className="flex gap-6"
            >
              <Field orientation="horizontal" className="w-auto">
                <RadioGroupItem id="payout-bank" value="bank" />
                <FieldLabel htmlFor="payout-bank" className="font-normal">
                  Bank
                </FieldLabel>
              </Field>
              <Field orientation="horizontal" className="w-auto">
                <RadioGroupItem id="payout-ewallet" value="ewallet" />
                <FieldLabel htmlFor="payout-ewallet" className="font-normal">
                  E-wallet
                </FieldLabel>
              </Field>
            </RadioGroup>
          </Field>
        )}
      />
      {method === 'bank' ? <BankForm /> : <WalletForm />}
    </div>
  );
}

export function LocationForm() {
  const { profile, save } = useProfile();
  const form = useForm<LocationValues>({
    resolver: zodResolver(locationSchema),
    defaultValues: pick(profile, ['street', 'city', 'postal', 'province']),
  });
  const { control } = form;

  return (
    <FormShell form={form} onSave={save}>
      <TextField
        control={control}
        name="street"
        label="Street address"
        autoComplete="street-address"
      />
      <TextField control={control} name="city" label="City / suburb" />
      <TextField
        control={control}
        name="postal"
        label="Area / postal code"
        inputMode="numeric"
      />
      <SelectField
        control={control}
        name="province"
        label="Province"
        options={provinces}
      />
    </FormShell>
  );
}
