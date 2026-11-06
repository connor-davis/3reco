import type { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import { CalendarIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { Calendar } from './calendar';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

interface DateRangePickerProps {
  value?: DateRange;
  onChange: (range: DateRange | undefined) => void;
  placeholder?: string;
  align?: 'start' | 'center' | 'end';
  fullWidth?: boolean;
}

export function DateRangePicker({
  value,
  onChange,
  placeholder = 'Pick date range',
  align = 'end',
  fullWidth = false,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(value);

  const label = value?.from
    ? value.to
      ? `${format(value.from, 'dd MMM')} – ${format(value.to, 'dd MMM yyyy')}`
      : format(value.from, 'dd MMM yyyy')
    : placeholder;

  function handleSelect(range: DateRange | undefined) {
    setDraft(range);
  }

  return (
    <div className={cn('flex items-center gap-1', fullWidth && 'w-full')}>
      <div className={cn(fullWidth && 'min-w-0 flex-1')}>
        <Popover
          open={open}
          onOpenChange={(next) => {
            if (next) setDraft(value);
            setOpen(next);
          }}
        >
          <PopoverTrigger
            render={(props) => (
              <Button
                variant="outline"
                className={cn(
                  'h-11 gap-2 text-sm font-normal',
                  fullWidth && 'w-full justify-start'
                )}
                {...props}
              >
                <CalendarIcon className="size-4 shrink-0" />
                <span
                  className={cn(
                    'truncate',
                    !value?.from && 'text-muted-foreground'
                  )}
                >
                  {label}
                </span>
              </Button>
            )}
          />
          <PopoverContent align={align} className="w-auto p-0">
            <Calendar mode="range" selected={draft} onSelect={handleSelect} />
            <div className="flex justify-end gap-2 border-t p-3">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={!draft?.from}
                onClick={() => {
                  if (!draft?.from) return;
                  onChange({ from: draft.from, to: draft.to ?? draft.from });
                  setOpen(false);
                }}
              >
                Apply dates
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      {value?.from && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Clear dates"
          onClick={() => onChange(undefined)}
        >
          <XIcon className="size-4" />
        </Button>
      )}
    </div>
  );
}
