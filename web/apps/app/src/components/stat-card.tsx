import type { CSSProperties } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

type StatCardProps = {
  tint?: 'mint' | 'peach' | 'lilac' | 'sky';
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  isLoading?: boolean;
  // True when the data failed to load, so no stale number is shown.
  unavailable?: boolean;
};

/** One number tile. Shows a skeleton while loading and a dash if it failed. */
export function StatCard({
  tint = 'mint',
  label,
  value,
  hint,
  icon: Icon,
  isLoading = false,
  unavailable = false,
}: StatCardProps) {
  return (
    <Card
      style={
        {
          '--tint': `var(--${tint})`,
          '--ink': `var(--${tint}-ink)`,
        } as CSSProperties
      }
      className="@container relative isolate gap-1 py-5 after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:-z-10 after:w-3/5 after:bg-[radial-gradient(circle_at_100%_0,var(--tint)_0,transparent_70%)] max-sm:[--card-spacing:--spacing(3)]"
    >
      <CardHeader>
        <CardDescription className="flex items-center gap-2 text-xs lg:text-sm">
          {Icon && (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[var(--tint)] text-[var(--ink)] max-lg:hidden">
              <Icon className="size-4" aria-hidden="true" />
            </span>
          )}
          {label}
        </CardDescription>
        <CardTitle className="text-[clamp(0.75rem,6cqi,1.875rem)] font-semibold tracking-tight whitespace-nowrap tabular-nums">
          {isLoading ? (
            <Skeleton className="h-8 w-24" />
          ) : unavailable ? (
            '—'
          ) : (
            value
          )}
        </CardTitle>
      </CardHeader>
      {hint && (
        <CardContent className="text-xs text-muted-foreground">
          {hint}
        </CardContent>
      )}
    </Card>
  );
}

/**
 * A responsive row of stat tiles: 1 column to 479px, then 2, then 4. With
 * `threeUp` (three tiles) it is 1 column, then 3 equal ones from 1024px.
 */
export function StatGrid({
  children,
  threeUp = false,
}: {
  children: React.ReactNode;
  threeUp?: boolean;
}) {
  return (
    <div
      className={
        threeUp
          ? 'grid grid-cols-3 gap-2 sm:gap-4'
          : 'grid grid-cols-2 gap-2 sm:gap-4 xl:grid-cols-4'
      }
    >
      {children}
    </div>
  );
}
