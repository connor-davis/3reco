import type { CSSProperties } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Trend } from '@/lib/format';
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
  trend?: Trend;
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
  trend,
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
        <CardTitle className="text-[clamp(1.25rem,9cqi,1.875rem)] font-semibold tracking-tight tabular-nums sm:whitespace-nowrap">
          {isLoading ? (
            <Skeleton className="h-8 w-24" />
          ) : unavailable ? (
            '—'
          ) : (
            // On a narrow phone tile the unit may drop to its own line.
            value.replace(/\u00a0(?=\D+$)/, ' ')
          )}
        </CardTitle>
      </CardHeader>
      {trend && !isLoading && !unavailable && <TrendLine trend={trend} />}
      {hint && (
        <CardContent className="text-xs text-muted-foreground">
          {hint}
        </CardContent>
      )}
    </Card>
  );
}

/**
 * A responsive row of stat tiles: hidden below 768px (the phone home shows the key numbers
 * instead), then 2, then 4 from 1280px. With `threeUp` (three tiles) it is 3
 * equal ones.
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
          ? 'grid grid-cols-3 gap-2 sm:gap-4 max-md:hidden'
          : 'grid grid-cols-2 gap-2 sm:gap-4 max-md:hidden xl:grid-cols-4'
      }
    >
      {children}
    </div>
  );
}

/** The small "up 12%" line under a tile value: mint up, rose down. */
export function TrendLine({ trend }: { trend: Trend }) {
  if (trend.dir === 'new' || trend.dir === 'flat') return null;

  const Arrow = trend.dir === 'up' ? ArrowUp : ArrowDown;
  const arrow = trend.dir === 'up' || trend.dir === 'down';

  return (
    <CardContent
      className={
        'flex items-center gap-1 text-xs font-medium ' +
        (trend.dir === 'up'
          ? 'text-mint-ink'
          : trend.dir === 'down'
            ? 'text-rose-ink'
            : 'text-muted-foreground')
      }
    >
      {arrow && <Arrow className="size-3" aria-hidden="true" />}
      {trend.label}
    </CardContent>
  );
}
