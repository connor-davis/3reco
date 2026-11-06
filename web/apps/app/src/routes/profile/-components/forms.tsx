import type { ReactNode } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  useForm,
  type FieldValues,
  type Path,
  type UseFormReturn,
} from 'react-hook-form';
import { toast } from 'sonner';
import { SelectField, TextField } from '@/components/form-fields';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api/client';
import { useUpdateProfile } from '@/lib/api/profile';
import type { Profile } from '@/lib/api/types';
import { tidyName } from '@/lib/names';
import {
  bankSchema,
  businessSchema,
  locationSchema,
  personalSchema,
  provinces,
  type BankValues,
  type BusinessValues,
  type LocationValues,
  type PersonalValues,
} from './schemas';

type Props = {
  profile: Profile;
  onSaved?: () => void | Promise<void>;
  // In the setup pages: a Continue button, with no cancel and no toast.
  wizard?: boolean;
};

function FormShell<T extends FieldValues>({
  form,
  onSave,
  wizard,
  children,
}: {
  form: UseFormReturn<T>;
  onSave: (values: T) => Promise<unknown>;
  wizard?: boolean;
  children: ReactNode;
}) {
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={form.handleSubmit(async (values) => {
        form.clearErrors('root');
        try {
          await onSave(values);
          form.reset(
            Object.fromEntries(
              Object.entries(values).map(([name, value]) => [
                name,
                name === 'id_number' || name === 'bank_account_number'
                  ? ''
                  : value,
              ])
            ) as T
          );
          if (!wizard) toast.success('Changes saved.');
        } catch (error) {
          if (error instanceof ApiError) {
            for (const [name, message] of Object.entries(error.fields ?? {})) {
              form.setError(name as Path<T>, { message });
            }
          }
          form.setError('root', {
            message:
              error instanceof Error
                ? error.message
                : 'Changes could not be saved. Try again.',
          });
        }
      })}
    >
      <fieldset
        disabled={form.formState.isSubmitting}
        className="grid gap-4 sm:grid-cols-2"
      >
        {children}
      </fieldset>
      {form.formState.errors.root && (
        <p role="alert" className="text-sm text-destructive">
          {form.formState.errors.root.message}
        </p>
      )}
      <div className="flex gap-2">
        {!wizard && (
          <Button
            className="min-h-11"
            type="button"
            variant="outline"
            disabled={form.formState.isSubmitting}
            onClick={() => form.reset()}
          >
            Cancel changes
          </Button>
        )}
        <Button
          className={wizard ? 'min-h-11 w-full' : 'min-h-11'}
          type="submit"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting
            ? 'Saving…'
            : wizard
              ? 'Continue'
              : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}

export function PersonalForm({ profile, onSaved, wizard }: Props) {
  const save = useUpdateProfile();
  const form = useForm<PersonalValues>({
    resolver: zodResolver(personalSchema),
    defaultValues: {
      first_name: profile.first_name,
      last_name: profile.last_name,
      phone: profile.phone,
      id_number: '',
    },
  });
  return (
    <FormShell
      form={form}
      wizard={wizard}
      onSave={async ({ id_number, ...values }) => {
        const first_name = tidyName(values.first_name);
        const last_name = tidyName(values.last_name);
        await save.mutateAsync({
          ...values,
          first_name,
          last_name,
          name: first_name + ' ' + last_name,
          ...(id_number ? { id_number } : {}),
        });
        await onSaved?.();
      }}
    >
      <TextField
        control={form.control}
        name="first_name"
        label="First name"
        personName
        autoComplete="given-name"
      />
      <TextField
        control={form.control}
        name="last_name"
        label="Last name"
        personName
        autoComplete="family-name"
      />
      <TextField
        control={form.control}
        name="id_number"
        label="South African ID"
        inputMode="numeric"
        description={
          profile.id_number
            ? 'Saved: ' + profile.id_number + '. Leave blank to keep it.'
            : 'Enter a 13-digit ID, if applicable.'
        }
        autoComplete="off"
      />
      <TextField
        control={form.control}
        name="phone"
        label="Phone number"
        type="tel"
      />
    </FormShell>
  );
}

export function BusinessForm({ profile, onSaved, wizard }: Props) {
  const save = useUpdateProfile();
  const form = useForm<BusinessValues>({
    resolver: zodResolver(businessSchema),
    defaultValues: {
      business_name: profile.business_name,
      business_registration_number: profile.business_registration_number,
    },
  });
  return (
    <FormShell
      form={form}
      wizard={wizard}
      onSave={async (values) => {
        await save.mutateAsync(values);
        await onSaved?.();
      }}
    >
      <TextField
        control={form.control}
        name="business_name"
        label="Business name"
      />
      <TextField
        control={form.control}
        name="business_registration_number"
        label="Registration number"
      />
    </FormShell>
  );
}

export function PayoutForm({ profile, onSaved, wizard }: Props) {
  const save = useUpdateProfile();
  const form = useForm<BankValues>({
    resolver: zodResolver(bankSchema),
    defaultValues: {
      bank_account_holder_name: profile.bank_account_holder_name,
      bank_name: profile.bank_name,
      bank_account_type: (profile.bank_account_type ||
        'Cheque') as BankValues['bank_account_type'],
      bank_account_number: '',
      bank_branch_code: profile.bank_branch_code,
    },
  });
  return (
    <FormShell
      form={form}
      wizard={wizard}
      onSave={async ({ bank_account_number, ...values }) => {
        if (!bank_account_number && !profile.bank_account_number)
          throw new Error('Enter an account number.');
        await save.mutateAsync({
          ...values,
          ...(bank_account_number ? { bank_account_number } : {}),
        });
        await onSaved?.();
      }}
    >
      <TextField
        control={form.control}
        name="bank_account_holder_name"
        label="Account holder"
      />
      <TextField control={form.control} name="bank_name" label="Bank" />
      <SelectField
        control={form.control}
        name="bank_account_type"
        label="Account type"
        options={['Cheque', 'Savings', 'Transmission']}
      />
      <TextField
        control={form.control}
        name="bank_account_number"
        label="Account number"
        inputMode="numeric"
        autoComplete="off"
        description={
          profile.bank_account_number
            ? 'Saved: ' +
              profile.bank_account_number +
              '. Leave blank to keep it.'
            : 'Enter the account number.'
        }
      />
      <TextField
        control={form.control}
        name="bank_branch_code"
        label="Branch code"
        inputMode="numeric"
      />
    </FormShell>
  );
}

export function LocationForm({ profile, onSaved, wizard }: Props) {
  const save = useUpdateProfile();
  const form = useForm<LocationValues>({
    resolver: zodResolver(locationSchema),
    defaultValues: {
      street_address: profile.street_address,
      city: profile.city,
      area_code:
        profile.area_code === null
          ? ''
          : String(profile.area_code).padStart(4, '0'),
      province: profile.province,
    },
  });
  return (
    <FormShell
      form={form}
      wizard={wizard}
      onSave={async ({ area_code, ...values }) => {
        await save.mutateAsync({ ...values, area_code: Number(area_code) });
        await onSaved?.();
      }}
    >
      <TextField
        control={form.control}
        name="street_address"
        label="Street address"
        autoComplete="street-address"
      />
      <TextField control={form.control} name="city" label="City / suburb" />
      <TextField
        control={form.control}
        name="area_code"
        label="Area / postal code"
        inputMode="numeric"
      />
      <SelectField
        control={form.control}
        name="province"
        label="Province"
        options={provinces}
      />
    </FormShell>
  );
}
