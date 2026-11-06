import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { SelectField, TextField } from '@/components/form-fields';
import { ResponsiveOverlay } from '@/components/responsive-overlay';
import { errorText } from '@/components/transactions/pager-state';
import { phoneSchema } from '@/components/transactions/phone';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ApiError } from '@/lib/api/client';
import { useCreateCollector, useUpdateCollector } from '@/lib/api/collectors';
import type { Collector, CollectorInput } from '@/lib/api/types';

const provinces = [
  'Eastern Cape',
  'Free State',
  'Gauteng',
  'KwaZulu-Natal',
  'Limpopo',
  'Mpumalanga',
  'Northern Cape',
  'North West',
  'Western Cape',
];
const banks = [
  'FNB',
  'Capitec',
  'Standard Bank',
  'ABSA',
  'Nedbank',
  'African Bank',
];
const accountTypes = ['Cheque', 'Savings', 'Transmission'];
const walletProviders = [
  'FNB eWallet',
  'Standard Bank Instant Money',
  'ABSA CashSend',
];

function schemaFor(collector?: Collector) {
  // The API sends account numbers masked. A masked value left as it is means
  // "keep what is saved", so it passes; anything new must be real digits.
  const unchanged = (value: string, saved?: string) =>
    !!saved && value === saved;

  return z
    .object({
      name: z.string().min(2, 'Enter the full name.'),
      email: z
        .string()
        .trim()
        .pipe(z.string().email('Enter a valid email.').or(z.literal(''))),
      phone: z
        .string()
        .trim()
        .pipe(phoneSchema.or(z.literal(''))),
      street_address: z.string().min(3, 'Enter the street address.'),
      city: z.string().min(2, 'Enter the city or suburb.'),
      area_code: z.string().regex(/^\d{4}$/, 'The area code is 4 digits.'),
      province: z.string().min(1, 'Pick a province.'),
      payout_method: z.enum(['bank', 'ewallet']),
      bank_account_holder_name: z.string(),
      bank_name: z.string(),
      bank_account_type: z.string(),
      bank_account_number: z.string(),
      bank_branch_code: z.string(),
      ewallet_platform_name: z.string(),
      ewallet_payment_id: z.string(),
    })
    .superRefine((values, ctx) => {
      const fail = (path: string, message: string) =>
        ctx.addIssue({ code: 'custom', path: [path], message });

      if (!values.email && !values.phone) {
        fail('email', 'Add an email or a phone number.');
        fail('phone', 'Add an email or a phone number.');
      }

      if (values.payout_method === 'bank') {
        if (!values.bank_account_holder_name.trim()) {
          fail('bank_account_holder_name', 'Enter the account holder.');
        }
        if (!values.bank_name) fail('bank_name', 'Pick a bank.');
        if (!values.bank_account_type) {
          fail('bank_account_type', 'Pick an account type.');
        }
        if (!values.bank_branch_code.trim()) {
          fail('bank_branch_code', 'Enter the branch code.');
        }
        if (
          !/^\d{6,16}$/.test(values.bank_account_number) &&
          !unchanged(values.bank_account_number, collector?.bank_account_number)
        ) {
          fail('bank_account_number', 'The account number is 6 to 16 digits.');
        }
      } else {
        if (!values.ewallet_platform_name) {
          fail('ewallet_platform_name', 'Pick a wallet provider.');
        }
        if (
          !values.ewallet_payment_id.trim() ||
          (values.ewallet_payment_id !== collector?.ewallet_payment_id &&
            !/^\d{9,12}$/.test(values.ewallet_payment_id.replace(/\s/g, '')))
        ) {
          fail('ewallet_payment_id', 'Enter the wallet phone number.');
        }
      }
    });
}

type Values = z.infer<ReturnType<typeof schemaFor>>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collector?: Collector;
};

function toValues(collector?: Collector): Values {
  return {
    name: collector?.name ?? '',
    email: collector?.email ?? '',
    phone: collector?.phone ?? '',
    street_address: collector?.street_address ?? '',
    city: collector?.city ?? '',
    area_code: collector?.area_code ? String(collector.area_code) : '',
    province: collector?.province ?? '',
    payout_method: collector?.payout_method === 'ewallet' ? 'ewallet' : 'bank',
    bank_account_holder_name: collector?.bank_account_holder_name ?? '',
    bank_name: collector?.bank_name ?? '',
    bank_account_type: collector?.bank_account_type ?? '',
    bank_account_number: collector?.bank_account_number ?? '',
    bank_branch_code: collector?.bank_branch_code ?? '',
    ewallet_platform_name: collector?.ewallet_platform_name ?? '',
    ewallet_payment_id: collector?.ewallet_payment_id ?? '',
  };
}

/** The payout side that is not in use is sent empty, so the API accepts it. */
function toInput(values: Values): CollectorInput {
  const bank = values.payout_method === 'bank';
  const { area_code, ...rest } = values;

  return {
    ...rest,
    area_code: Number(area_code),
    bank_account_holder_name: bank ? values.bank_account_holder_name : '',
    bank_name: bank ? values.bank_name : '',
    bank_account_type: bank ? values.bank_account_type : '',
    bank_account_number: bank ? values.bank_account_number : '',
    bank_branch_code: bank ? values.bank_branch_code : '',
    ewallet_platform_name: bank ? '' : values.ewallet_platform_name,
    ewallet_payment_id: bank ? '' : values.ewallet_payment_id,
  };
}

/** Add or edit a collector, with the payout details they get paid to. */
export function CollectorDialog({ open, onOpenChange, collector }: Props) {
  const create = useCreateCollector();
  const update = useUpdateCollector(collector?.id ?? '');
  const [serverError, setServerError] = useState('');
  const { control, handleSubmit, watch, setError } = useForm<Values>({
    resolver: zodResolver(schemaFor(collector)),
    values: toValues(collector),
  });
  const method = watch('payout_method');

  async function onSubmit(values: Values) {
    setServerError('');

    try {
      if (collector) {
        await update.mutateAsync(toInput(values));
        toast.success('Collector updated.');
      } else {
        await create.mutateAsync(toInput(values));
        toast.success('Collector added.');
      }
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError && error.fields) {
        for (const [name, message] of Object.entries(error.fields)) {
          if (name in values) setError(name as keyof Values, { message });
        }
      }
      setServerError(errorText(error));
    }
  }

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={onOpenChange}
      wide
      title={collector ? 'Edit collector' : 'Add collector'}
      description={
        collector
          ? 'Update this collector’s contact and payout details.'
          : 'Add someone you buy from, with how to reach and pay them.'
      }
      footer={
        <Button
          disabled={create.isPending || update.isPending}
          onClick={handleSubmit(onSubmit)}
        >
          {collector ? 'Save changes' : 'Add collector'}
        </Button>
      }
    >
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="grid gap-4 sm:grid-cols-2"
        noValidate
      >
        <TextField control={control} name="name" label="Full name" />
        <TextField control={control} name="email" label="Email" type="email" />
        <TextField control={control} name="phone" label="Phone" type="tel" />
        <TextField
          control={control}
          name="street_address"
          label="Street address"
        />
        <TextField control={control} name="city" label="City / suburb" />
        <TextField
          control={control}
          name="area_code"
          label="Area code"
          inputMode="numeric"
        />
        <SelectField
          control={control}
          name="province"
          label="Province"
          options={provinces}
        />
        <Controller
          control={control}
          name="payout_method"
          render={({ field }) => (
            <Field className="sm:col-span-2">
              <FieldLabel id="collector-method-label">Payout method</FieldLabel>
              <RadioGroup
                value={field.value}
                onValueChange={field.onChange}
                aria-labelledby="collector-method-label"
                className="flex gap-6"
              >
                <Field orientation="horizontal" className="w-auto">
                  <RadioGroupItem id="collector-bank" value="bank" />
                  <FieldLabel htmlFor="collector-bank" className="font-normal">
                    Bank
                  </FieldLabel>
                </Field>
                <Field orientation="horizontal" className="w-auto">
                  <RadioGroupItem id="collector-ewallet" value="ewallet" />
                  <FieldLabel
                    htmlFor="collector-ewallet"
                    className="font-normal"
                  >
                    E-wallet
                  </FieldLabel>
                </Field>
              </RadioGroup>
            </Field>
          )}
        />
        {method === 'bank' ? (
          <>
            <TextField
              control={control}
              name="bank_account_holder_name"
              label="Account holder"
            />
            <SelectField
              control={control}
              name="bank_name"
              label="Bank"
              options={banks}
            />
            <SelectField
              control={control}
              name="bank_account_type"
              label="Account type"
              options={accountTypes}
            />
            <TextField
              control={control}
              name="bank_account_number"
              label="Account number"
              inputMode="numeric"
              autoComplete="off"
            />
            <TextField
              control={control}
              name="bank_branch_code"
              label="Branch code"
              inputMode="numeric"
            />
          </>
        ) : (
          <>
            <SelectField
              control={control}
              name="ewallet_platform_name"
              label="Wallet provider"
              options={walletProviders}
            />
            <TextField
              control={control}
              name="ewallet_payment_id"
              label="Wallet phone number"
              type="tel"
              autoComplete="off"
            />
          </>
        )}
        {serverError && (
          <p role="alert" className="text-sm text-destructive sm:col-span-2">
            {serverError}
          </p>
        )}
      </form>
    </ResponsiveOverlay>
  );
}
