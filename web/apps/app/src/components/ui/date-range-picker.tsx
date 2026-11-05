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

  const label = value?.from
    ? value.to
      ? `${format(value.from, 'dd MMM')} – ${format(value.to, 'dd MMM yyyy')}`
      : format(value.from, 'dd MMM yyyy')
    : placeholder;

  function handleSelect(range: DateRange | undefined) {
    onChange(range);
    // Close only once both ends of the range are picked
    if (range?.from && range?.to) setOpen(false);
  }

  return (
    <div className={cn('flex items-center gap-1', fullWidth && 'w-full')}>
      <div className={cn(fullWidth && 'min-w-0 flex-1')}>
        <Popover open={open} onOpenChange={(v) => setOpen(v)}>
          <PopoverTrigger
            render={(props) => (
              <Button
                variant="outline"
                className={cn(
                  'h-9 gap-2 text-sm font-normal',
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
            <Calendar mode="range" selected={value} onSelect={handleSelect} />
          </PopoverContent>
        </Popover>
      </div>
      {value?.from && (
        <Button variant="ghost" size="icon" onClick={() => onChange(undefined)}>
          <XIcon className="size-4" />
        </Button>
      )}
    </div>
  );
}
