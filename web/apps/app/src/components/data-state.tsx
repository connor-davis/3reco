import type { ReactNode } from 'react';
import { AlertTriangle, type LucideIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api/client';

type QueryLike = {
  isPending: boolean;
  isError: boolean;
  error?: unknown;
  refetch: () => unknown;
};

type DataStateProps = {
  // The TanStack Query result(s) from a lib/api hook. Loading if any is pending.
  query?: QueryLike | QueryLike[];
  // True when the page has nothing to show once the data is loaded.
  isEmpty?: boolean;
  icon: LucideIcon;
  emptyTitle: string;
  emptyText: string;
  emptyAction?: ReactNode;
  // What the page looks like while it loads. Defaults to a few rows.
  skeleton?: ReactNode;
  children: ReactNode;
};

/**
 * Every data page wraps its content in this: loading, then error with a
 * retry, then empty, then the page.
 */
export function DataState({
  query,
  isEmpty = false,
  icon: Icon,
  emptyTitle,
  emptyText,
  emptyAction,
  skeleton,
  children,
}: DataStateProps) {
  const queries = query === undefined ? [] : [query].flat();
  const failed = queries.filter((item) => item.isError);
  // A missing record is an empty page, not a failure worth retrying.
  const notFound =
    failed[0]?.error instanceof ApiError && failed[0].error.status === 404;

  if (queries.some((item) => item.isPending)) {
    return <div aria-busy="true">{skeleton ?? <RowsSkeleton />}</div>;
  }

  if (failed.length > 0 && !notFound) {
    const error = failed[0]?.error;

    return (
      <Alert variant="destructive">
        <AlertTriangle />
        <AlertTitle>We couldn't load this page</AlertTitle>
        <AlertDescription>
          <p>
            {error instanceof ApiError
              ? error.message
              : 'Check your connection and try again.'}
          </p>
          <Button
            className="mt-3"
            size="sm"
            variant="outline"
            onClick={() => failed.forEach((item) => void item.refetch())}
          >
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (isEmpty || notFound) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Icon />
          </EmptyMedia>
          <EmptyTitle>{emptyTitle}</EmptyTitle>
          <EmptyDescription>{emptyText}</EmptyDescription>
        </EmptyHeader>
        {emptyAction && <EmptyContent>{emptyAction}</EmptyContent>}
      </Empty>
    );
  }

  return <>{children}</>;
}

/** Placeholder rows for tables and lists while data loads. */
export function RowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-14 w-full rounded-xl" />
      ))}
    </div>
  );
}

/** Placeholder cards for grids while data loads. */
export function CardsSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {Array.from({ length: cards }, (_, index) => (
        <div key={index} aria-hidden="true">
          <Skeleton className="aspect-[4/3] rounded-2xl" />
          <div className="mt-3.5 space-y-1.5">
            <div className="min-h-12 space-y-2 py-1">
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-4 w-3/5" />
            </div>
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-5 w-2/5" />
            <div className="flex min-h-11 items-center">
              <Skeleton className="h-5 w-3/5" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
