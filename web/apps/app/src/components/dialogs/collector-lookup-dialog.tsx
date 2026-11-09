import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { TextField } from '@/components/form-fields';
import { ResponsiveOverlay } from '@/components/responsive-overlay';
import { errorText } from '@/components/transactions/pager-state';
import { phoneSchema } from '@/components/transactions/phone';
import { Button } from '@/components/ui/button';
import { useCollectorStats } from '@/lib/api/collectors';
import { formatKg, formatRand, toCents } from '@/lib/format';

const schema = z.object({ phone: phoneSchema });

type Values = z.infer<typeof schema>;

type Props = { open: boolean; onOpenChange: (open: boolean) => void };

/**
 * Looks a collector up by phone number and shows their trade totals.
 * Collectors are linked to a login by their own profile phone, set by an
 * admin, so this never changes anyone's role (decision D8).
 */
export function CollectorLookupDialog({ open, onOpenChange }: Props) {
  const [phone, setPhone] = useState('');
  const stats = useCollectorStats(phone);
  const { control, handleSubmit } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { phone: '' },
  });
  const found = stats.data;

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={onOpenChange}
      title="Find a collector"
      description="Enter the phone number the collector was added with."
      footer={
        <Button onClick={handleSubmit((values) => setPhone(values.phone))}>
          Find collector
        </Button>
      }
    >
      <form
        onSubmit={handleSubmit((values) => setPhone(values.phone))}
        className="space-y-4"
        noValidate
      >
        <TextField
          control={control}
          name="phone"
          label="Phone number"
          type="tel"
          autoComplete="tel"
        />
        {phone && stats.isPending && (
          <p className="text-sm text-muted-foreground">Looking…</p>
        )}
        {phone && stats.isError && (
          <p role="alert" className="text-sm text-destructive">
            {errorText(stats.error)}
          </p>
        )}
        {found && (
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Collector</dt>
              <dd className="font-medium">{found.collector.name}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Collections</dt>
              <dd className="font-medium">{found.totals.transaction_count}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Weight</dt>
              <dd className="font-medium">
                {formatKg(found.totals.total_volume)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Value</dt>
              <dd className="font-medium">
                {formatRand(toCents(found.totals.total_revenue))}
              </dd>
            </div>
          </dl>
        )}
      </form>
    </ResponsiveOverlay>
  );
}
