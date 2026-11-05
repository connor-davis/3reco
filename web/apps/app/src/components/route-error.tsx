import type { ErrorComponentProps } from '@tanstack/react-router';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';

/** What a page shows when it throws, so one bug never blanks the whole app. */
export function RouteError({ reset }: ErrorComponentProps) {
  return (
    <Empty className="m-auto max-w-lg border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <AlertTriangle />
        </EmptyMedia>
        <EmptyTitle>This page hit a problem</EmptyTitle>
        <EmptyDescription>
          Nothing was lost. Try again, or go back to the start.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row justify-center">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" onClick={() => window.location.assign('/')}>
          Go to start
        </Button>
      </EmptyContent>
    </Empty>
  );
}
