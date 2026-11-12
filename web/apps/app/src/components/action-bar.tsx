import type { ComponentProps, ReactNode } from 'react';
import { ButtonRow } from '@/components/button-row';
import { cn } from '@/lib/utils';

/** Reserves space in the page for actions pinned above the compact navigation. */
export function ActionBar({
  label,
  children,
  className,
  ...props
}: ComponentProps<'div'> & { label?: ReactNode }) {
  return (
    <div className="max-lg:pb-[calc(13rem+env(safe-area-inset-bottom))]">
      <div
        data-slot="action-bar"
        className={cn(
          'flex gap-4 max-lg:fixed max-lg:inset-x-0 max-lg:bottom-[calc(52px+env(safe-area-inset-bottom))] max-lg:z-20 max-lg:flex-col max-lg:border-t max-lg:bg-background max-lg:px-5 max-lg:py-4 lg:items-center lg:justify-end',
          className
        )}
        {...props}
      >
        {label && <div className="min-w-0 text-sm lg:mr-auto">{label}</div>}
        <ButtonRow>{children}</ButtonRow>
      </div>
    </div>
  );
}
