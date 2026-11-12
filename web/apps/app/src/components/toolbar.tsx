import { useState, type ReactNode } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { SearchBox } from '@/components/filters';
import { ResponsiveOverlay } from '@/components/responsive-overlay';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';

type ToolbarProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  filters?: ReactNode;
  activeFilters?: number;
  onClear?: () => void;
  action?: ReactNode;
};

/** One search row; compact filters use the existing responsive bottom sheet. */
export function Toolbar({
  label,
  value,
  onChange,
  filters,
  activeFilters = 0,
  onClear,
  action,
}: ToolbarProps) {
  const [open, setOpen] = useState(false);
  const compact = useIsMobile();

  return (
    <div
      data-slot="toolbar"
      className="flex min-w-0 flex-nowrap items-center gap-2"
    >
      <SearchBox
        label={label}
        value={value}
        onChange={onChange}
        className="min-w-0 basis-0 sm:max-w-none"
      />
      {filters &&
        (compact ? (
          <>
            <Button
              variant="outline"
              className="h-11 shrink-0"
              onClick={() => setOpen(true)}
            >
              <SlidersHorizontal aria-hidden="true" />
              Filters{activeFilters > 0 ? ` (${activeFilters})` : ''}
            </Button>
            <FilterSheet open={open} onOpenChange={setOpen} onClear={onClear}>
              {filters}
            </FilterSheet>
          </>
        ) : (
          <div className="flex min-w-0 flex-nowrap items-center gap-2 [&>*]:min-w-0 [&>*]:shrink [&>*]:basis-auto">
            {filters}
          </div>
        ))}
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** Filters apply live; Show results dismisses the sheet and keeps their values. */
export function FilterSheet({
  open,
  onOpenChange,
  onClear,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClear?: () => void;
  children: ReactNode;
}) {
  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={onOpenChange}
      title="Filters"
      description="Choose which results to show."
      footer={
        <>
          <Button variant="outline" onClick={onClear}>
            Clear
          </Button>
          <Button onClick={() => onOpenChange(false)}>Show results</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 [&>*]:w-full">{children}</div>
    </ResponsiveOverlay>
  );
}
