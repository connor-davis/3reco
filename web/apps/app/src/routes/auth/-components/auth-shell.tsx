import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { Leaf, Recycle } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useMock } from '@/lib/mock/hooks';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatKg } from '@/lib/format';
import { community, formatCo2 } from '@/lib/impact';

type AuthShellProps = {
  title: string;
  description: string;
  // One line shown in a live region: errors, or the generic success text.
  feedback?: { tone: 'error' | 'info'; text: string } | null;
  children: ReactNode;
  footer?: ReactNode;
};

/** Two regions: a story panel on the left, the form panel on the right. */
export function AuthShell({
  title,
  description,
  feedback,
  children,
  footer,
}: AuthShellProps) {
  const { pageState, setPageState } = useMock();

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <StoryPanel />
      <main
        id="main-content"
        className="relative flex flex-col justify-center px-6 py-12 sm:px-12"
      >
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        <div className="mx-auto w-full max-w-sm space-y-6">
          <Link
            to="/"
            className="flex items-center gap-2 font-semibold lg:hidden"
          >
            <Recycle className="size-5 text-primary" aria-hidden="true" />
            3REco
          </Link>
          <header className="space-y-1">
            <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
            <p className="text-muted-foreground">{description}</p>
          </header>
          <div aria-live="polite">
            {feedback && (
              <Alert
                variant={feedback.tone === 'error' ? 'destructive' : 'default'}
              >
                <AlertDescription>{feedback.text}</AlertDescription>
              </Alert>
            )}
          </div>
          {pageState === 'loading' ? (
            <div aria-busy="true" className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : pageState === 'error' ? (
            <Alert variant="destructive">
              <AlertDescription>
                <p>We couldn't load this page. Check your connection.</p>
                <Button
                  className="mt-3"
                  size="sm"
                  variant="outline"
                  onClick={() => setPageState('ready')}
                >
                  Try again
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            children
          )}
          {footer && (
            <div className="space-y-2 text-center text-sm text-muted-foreground">
              {footer}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function StoryPanel() {
  return (
    <aside className="hidden flex-col justify-between bg-muted p-12 lg:flex">
      <Link to="/" className="flex items-center gap-2 text-lg font-semibold">
        <Recycle className="size-6 text-primary" aria-hidden="true" />
        3REco
      </Link>
      <div className="space-y-6">
        <h2 className="max-w-md text-4xl font-semibold tracking-tight">
          Materials find a home. People find a connection.
        </h2>
        <Card className="max-w-sm">
          <CardContent className="space-y-1">
            <Badge variant="secondary">Clear PET</Badge>
            <p className="font-medium">64 kg collected in Alexandra</p>
            <p className="text-sm text-muted-foreground">R 307.20 paid today</p>
          </CardContent>
        </Card>
        <p className="w-fit rounded-2xl rounded-bl-sm bg-card px-4 py-3 text-sm shadow-sm">
          Looks good. Let's arrange collection.
        </p>
      </div>
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Leaf className="size-4 text-primary" aria-hidden="true" />
        {formatKg(community.kgDiverted)} diverted · {formatCo2(community.co2Kg)}{' '}
        saved
      </p>
    </aside>
  );
}
