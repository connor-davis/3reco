import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** Two compact actions share a row; larger groups stack without wasting width. */
export function ButtonRow({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="button-row"
      className={cn(
        'flex w-full gap-2 [&>*]:min-h-11 [&>*]:min-w-0 [&>*]:flex-1 [&>*]:whitespace-normal has-[>:nth-child(3)]:flex-col lg:w-auto lg:flex-row lg:justify-end lg:[&>*]:flex-none lg:has-[>:nth-child(3)]:flex-row',
        className
      )}
      {...props}
    />
  );
}
