import type { ComponentProps, ReactNode } from 'react';
import { ButtonRow } from '@/components/button-row';
import { cn } from '@/lib/utils';

/** Main actions pinned above compact navigation or aligned at the wide content end. */
export function ActionBar({
  label,
  children,
  className,
  ...props
}: ComponentProps<'div'> & { label?: ReactNode }) {
  return (
    <div
      data-slot="action-bar"
      className={cn(
        'flex gap-4 max-lg:fixed max-lg:inset-x-0 max-lg:bottom-[calc(52px+env(safe-area-inset-bottom))] max-lg:z-20 max-lg:flex-col max-lg:border-t max-lg:bg-background max-lg:px-5 max-lg:py-4 lg:flex-wrap lg:items-center lg:justify-end',
        className
      )}
      {...props}
    >
      {label && (
        <div className="min-w-0 text-sm lg:min-w-48 lg:flex-1">{label}</div>
      )}
      <ButtonRow className="lg:ml-auto lg:shrink-0">{children}</ButtonRow>
    </div>
  );
}

/** Put this after the page content so the pinned actions cannot cover its last row. */
export function ActionBarSpacer() {
  return (
    <div
      aria-hidden="true"
      className="max-lg:pb-[calc(13rem+env(safe-area-inset-bottom))]"
    />
  );
}
