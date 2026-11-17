import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { SelectField, TextareaField } from '@/components/form-fields';
import { ResponsiveOverlay } from '@/components/responsive-overlay';
import { Button } from '@/components/ui/button';
import { useReport, type ReportInput } from '@/lib/api/reports';

const reasons = [
  { value: 'scam', label: 'Scam' },
  { value: 'wrong_info', label: 'Wrong information' },
  { value: 'offensive', label: 'Offensive content' },
  { value: 'spam', label: 'Spam' },
  { value: 'other', label: 'Something else' },
];

export function ReportDialog({
  open,
  onOpenChange,
  kind,
  target,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: ReportInput['target_kind'];
  target: string;
}) {
  const report = useReport();
  const [error, setError] = useState('');
  const form = useForm({ defaultValues: { reason: '', details: '' } });
  const reason = form.watch('reason');
  const submit = form.handleSubmit(async (values) => {
    if (!values.reason) return;
    if ([...values.details.trim()].length > 1000) {
      setError('Use at most 1000 characters.');
      return;
    }
    setError('');
    try {
      await report.mutateAsync({
        target_kind: kind,
        target_id: target,
        ...values,
      });
      toast.success('Report sent.');
      onOpenChange(false);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Could not send your report. Try again.'
      );
    }
  });

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={onOpenChange}
      title="Report"
      description="Only 3REco admins can see your report. The business will not be told."
      locked={report.isPending}
      footer={
        <Button disabled={report.isPending || !reason} onClick={submit}>
          {report.isPending ? 'Sending…' : 'Send report'}
        </Button>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <SelectField
          control={form.control}
          name="reason"
          label="Reason"
          placeholder="Choose a reason"
          options={reasons}
        />
        <TextareaField
          control={form.control}
          name="details"
          label="Details (optional, up to 1000 characters)"
          rows={4}
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </form>
    </ResponsiveOverlay>
  );
}
