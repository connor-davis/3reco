import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { SelectField, TextField } from '@/components/form-fields';
import { ResponsiveOverlay } from '@/components/responsive-overlay';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { banks, provinces, walletProviders } from '@/lib/data/people';
import { useMockList } from '@/lib/mock/hooks';
import type { Collector } from '@/lib/types';

const schema = z
  .object({
    name: z.string().min(2, 'Enter the full name.'),
    email: z.string().email('Enter a valid email.'),
    phone: z
      .string()
      .regex(/^0\d{2} ?\d{3} ?\d{4}$/, 'Use a phone like 082 555 0148.'),
    street: z.string().min(3, 'Enter the street address.'),
    city: z.string().min(2, 'Enter the city or suburb.'),
    postal: z.string().regex(/^\d{4}$/, 'The area code is 4 digits.'),
    province: z.string().min(1, 'Pick a province.'),
    method: z.enum(['bank', 'ewallet']),
    bank: z.string(),
    accountNumber: z.string(),
    walletProvider: z.string(),
    walletPhone: z.string(),
  })
  .superRefine((values, ctx) => {
    const fail = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });

    if (values.method === 'bank') {
      if (!values.bank) fail('bank', 'Pick a bank.');
      if (!/^\d{6,16}$/.test(values.accountNumber)) {
        fail('accountNumber', 'The account number is 6 to 16 digits.');
      }
    } else {
      if (!values.walletProvider)
        fail('walletProvider', 'Pick a wallet provider.');
      if (!values.walletPhone)
        fail('walletPhone', 'Enter the wallet phone number.');
    }
  });

type Values = z.infer<typeof schema>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collector?: Collector;
};

function toValues(collector?: Collector): Values {
  const payout = collector?.payout;

  return {
    name: collector?.name ?? '',
    email: collector?.email ?? '',
    phone: collector?.phone ?? '',
    street: collector?.street ?? '',
    city: collector?.city ?? '',
    postal: collector?.postal ?? '',
    province: collector?.province ?? '',
    method: payout?.method ?? 'bank',
    bank: payout?.method === 'bank' ? payout.bank : '',
    accountNumber: payout?.method === 'bank' ? payout.accountNumber : '',
    walletProvider: payout?.method === 'ewallet' ? payout.walletProvider : '',
    walletPhone: payout?.method === 'ewallet' ? payout.walletPhone : '',
  };
}

/** Add or edit a collector, with the payout details they get paid to. */
export function CollectorDialog({ open, onOpenChange, collector }: Props) {
  const list = useMockList('collectors');
  const { control, handleSubmit, watch } = useForm<Values>({
    resolver: zodResolver(schema),
    values: toValues(collector),
  });
  const method = watch('method');

  function onSubmit(values: Values) {
    const payout: Collector['payout'] =
      values.method === 'bank'
        ? {
            method: 'bank',
            bank: values.bank,
            accountType: 'Savings',
            accountNumber: values.accountNumber,
            branchCode: '000000',
          }
        : {
            method: 'ewallet',
            walletProvider: values.walletProvider,
            walletPhone: values.walletPhone,
          };
    const next = {
      name: values.name,
      email: values.email,
      phone: values.phone,
      street: values.street,
      city: values.city,
      postal: values.postal,
      province: values.province,
      payout,
    };

    if (collector) {
      list.update(collector.id, next);
      toast.success('Collector updated.');
    } else {
      list.add({ id: values.name.toLowerCase().replace(/\W+/g, '-'), ...next });
      toast.success('Collector added.');
    }

    onOpenChange(false);
  }

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={onOpenChange}
      wide
      title={collector ? 'Edit collector' : 'Add collector'}
      description={
        collector
          ? 'Change this collector’s contact and payout details.'
          : 'Add someone you buy from, with how to reach and pay them.'
      }
      footer={
        <Button onClick={handleSubmit(onSubmit)}>
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
        <TextField control={control} name="street" label="Street address" />
        <TextField control={control} name="city" label="City / suburb" />
        <TextField
          control={control}
          name="postal"
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
          name="method"
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
            <SelectField
              control={control}
              name="bank"
              label="Bank"
              options={banks}
            />
            <TextField
              control={control}
              name="accountNumber"
              label="Account number"
              inputMode="numeric"
            />
          </>
        ) : (
          <>
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
          </>
        )}
      </form>
    </ResponsiveOverlay>
  );
}
