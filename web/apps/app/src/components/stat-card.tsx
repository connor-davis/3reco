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
  label,
  value,
  hint,
  icon: Icon,
  isLoading = false,
  unavailable = false,
}: StatCardProps) {
  return (
    <Card className="gap-1 bg-muted py-5 ring-0">
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          {Icon && <Icon className="size-4" aria-hidden="true" />}
          {label}
        </CardDescription>
        <CardTitle className="text-3xl font-semibold tracking-tight tabular-nums">
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

/** A responsive row of stat tiles: 1 column to 479px, then 2, then 4. */
export function StatGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-4 min-[480px]:grid-cols-2 xl:grid-cols-4">
      {children}
    </div>
  );
}
