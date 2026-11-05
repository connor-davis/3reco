import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { TextField } from '@/components/form-fields';
import { ResponsiveOverlay } from '@/components/responsive-overlay';
import { Button } from '@/components/ui/button';
import { useMock } from '@/lib/mock/hooks';

const schema = z.object({
  phone: z
    .string()
    .regex(/^0\d{2} ?\d{3} ?\d{4}$/, 'Use a phone like 082 555 0148.'),
});

type Values = z.infer<typeof schema>;

type Props = { open: boolean; onOpenChange: (open: boolean) => void };

/** Finds a collector by phone number so their account can be linked (sign-in page). */
export function CollectorLookupDialog({ open, onOpenChange }: Props) {
  const { data, setRole } = useMock();
  const { control, handleSubmit, setError } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { phone: '' },
  });

  function lookup({ phone }: Values) {
    const found = data.collectors.find(
      (collector) =>
        collector.phone.replace(/\s/g, '') === phone.replace(/\s/g, '')
    );

    if (!found) {
      setError('phone', {
        message: 'We could not find a collector with that phone number.',
      });
      return;
    }

    setRole('collector');
    onOpenChange(false);
    toast.success(`Linked ${found.name}'s collector account.`);
  }

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={onOpenChange}
      title="Link a collector account"
      description="Enter the phone number your business used when it added you."
      footer={<Button onClick={handleSubmit(lookup)}>Find my account</Button>}
    >
      <form onSubmit={handleSubmit(lookup)} noValidate>
        <TextField
          control={control}
          name="phone"
          label="Phone number"
          type="tel"
          autoComplete="tel"
          description="Try 082 555 0148 in this preview."
        />
      </form>
    </ResponsiveOverlay>
  );
}
