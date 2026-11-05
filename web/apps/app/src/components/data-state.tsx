import type { ReactNode } from 'react';
import { AlertTriangle, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
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
import { useMock } from '@/lib/mock/hooks';

type DataStateProps = {
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
 * Every data page wraps its content in this. The Preview control's state
 * (ready, loading, empty, error) decides what shows, so a reviewer can see
 * all four on any page.
 */
export function DataState({
  isEmpty = false,
  icon: Icon,
  emptyTitle,
  emptyText,
  emptyAction,
  skeleton,
  children,
}: DataStateProps) {
  const { pageState, setPageState } = useMock();

  if (pageState === 'loading') {
    return <div aria-busy="true">{skeleton ?? <RowsSkeleton />}</div>;
  }

  if (pageState === 'error') {
    return (
      <Alert variant="destructive">
        <AlertTriangle />
        <AlertTitle>We couldn't load this page</AlertTitle>
        <AlertDescription>
          <p>Check your connection and try again.</p>
          <Button
            className="mt-3"
            size="sm"
            variant="outline"
            onClick={() => {
              setPageState('ready');
              toast.success('Loaded again.');
            }}
          >
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (pageState === 'empty' || isEmpty) {
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
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: cards }, (_, index) => (
        <Skeleton key={index} className="h-64 rounded-2xl" />
      ))}
    </div>
  );
}
