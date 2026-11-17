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
  // Keep the Filters button and sheet on wide screens too (the market page).
  sheetOnDesktop?: boolean;
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
  sheetOnDesktop = false,
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
        (compact || sheetOnDesktop ? (
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
        // Side by side, so the two buttons don't eat half a phone screen.
        <div className="grid w-full grid-cols-2 gap-2">
          <Button variant="outline" onClick={onClear}>
            Clear
          </Button>
          <Button onClick={() => onOpenChange(false)}>Show results</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 [&>*]:w-full">{children}</div>
    </ResponsiveOverlay>
  );
}

/** A small visible heading over one group in the Filters sheet. */
export function FilterField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </div>
  );
}
