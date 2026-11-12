import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { Leaf } from 'lucide-react';
import { BrandLogo } from '@/components/brand-logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { formatKg } from '@/lib/format';
import { formatCo2, useCommunity } from '@/lib/impact';

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
            <BrandLogo />
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
          {children}
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
  const community = useCommunity();

  return (
    <aside className="hidden flex-col justify-between bg-muted p-12 lg:flex">
      <Link to="/" className="flex items-center gap-2 text-lg font-semibold">
        <BrandLogo className="h-9" />
      </Link>
      <div className="space-y-6">
        <h2 className="max-w-md text-4xl font-semibold tracking-tight">
          Materials find a home. People find a connection.
        </h2>
      </div>
      {/* Always one block, so the tagline stays put while the numbers load.
          Hidden until they do, so a failed load never shows zeros. */}
      <div className="min-h-5">
        {community.query.isSuccess && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Leaf className="size-4 text-primary" aria-hidden="true" />
            {formatKg(community.kgDiverted)} diverted ·{' '}
            {formatCo2(community.co2Kg)}
          </p>
        )}
      </div>
    </aside>
  );
}
