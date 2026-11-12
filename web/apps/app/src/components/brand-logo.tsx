import { cn } from '@/lib/utils';

/** The 3REco wordmark. Dark mode swaps in a copy with a light "Eco" so it stays readable. */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <>
      <img
        src="/logo-full.png"
        alt="3REco"
        className={cn('h-7 w-auto dark:hidden', className)}
      />
      <img
        src="/logo-full-dark.png"
        alt="3REco"
        className={cn('hidden h-7 w-auto dark:block', className)}
      />
    </>
  );
}
