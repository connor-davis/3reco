import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** Full-width actions stack on phones and use their natural widths from md up. */
export function ButtonRow({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="button-row"
      className={cn(
        'flex w-full flex-col gap-2 [&>*]:min-h-11 [&>*]:min-w-0 [&>*]:w-full [&>*]:whitespace-normal md:w-auto md:flex-row md:justify-end md:[&>*]:w-auto md:[&>*]:flex-none',
        className
      )}
      {...props}
    />
  );
}
