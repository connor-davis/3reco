import { useState } from 'react';
import { toast } from 'sonner';
import { ResponsiveOverlay } from '@/components/responsive-overlay';
import { RowActions } from '@/components/row-actions';
import { errorText } from '@/components/transactions/pager-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDownloadPeriodRecord } from '@/lib/api/transactions';
import { monthRange, today } from '@/lib/format';

type Choice = 'this' | 'last' | 'custom';

const choices: { value: Choice; label: string }[] = [
  { value: 'this', label: 'This month' },
  { value: 'last', label: 'Last month' },
  { value: 'custom', label: 'Custom dates' },
];

/** A page-header menu for downloading a batch recycling record. */
export function RecyclingRecordButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <RowActions
        name="transactions"
        actions={[{ label: 'Recycling record', onSelect: () => setOpen(true) }]}
      />
      <RecyclingRecordDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

/** Pick a month or two dates, then download a PDF of your completed trades in it. */
export function RecyclingRecordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const download = useDownloadPeriodRecord();
  const [choice, setChoice] = useState<Choice>('this');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const range = choice === 'custom' ? { from, to } : monthRange(choice);
  const problem =
    choice !== 'custom'
      ? ''
      : !from || !to
        ? 'Pick a start and an end date.'
        : from > to
          ? 'The end date cannot be before the start date.'
          : '';

  function start() {
    download.mutate(range, {
      onSuccess: () => {
        toast.success('Recycling record downloaded.');
        onOpenChange(false);
      },
      onError: (error) => toast.error(errorText(error)),
    });
  }

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={onOpenChange}
      title="Recycling record"
      description="A PDF of the weights reported on your completed trades, bought and sold, with the carbon saved."
      locked={download.isPending}
      footer={
        <Button disabled={download.isPending || !!problem} onClick={start}>
          {download.isPending ? 'Preparing…' : 'Download'}
        </Button>
      }
    >
      <div className="space-y-4">
        <div role="group" aria-label="Period" className="flex flex-wrap gap-2">
          {choices.map((item) => (
            <Button
              key={item.value}
              type="button"
              variant={choice === item.value ? 'default' : 'outline'}
              aria-pressed={choice === item.value}
              onClick={() => setChoice(item.value)}
            >
              {item.label}
            </Button>
          ))}
        </div>
        {choice === 'custom' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="record-from">From</Label>
              <Input
                id="record-from"
                type="date"
                max={today()}
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="record-to">To</Label>
              <Input
                id="record-to"
                type="date"
                max={today()}
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {range.from} to {range.to}
          </p>
        )}
        {problem && <p className="text-sm text-destructive">{problem}</p>}
        <p className="text-sm text-muted-foreground">
          Up to one year at a time.
        </p>
      </div>
    </ResponsiveOverlay>
  );
}
