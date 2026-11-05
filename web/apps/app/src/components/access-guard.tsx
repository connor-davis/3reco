import type { ReactNode } from 'react';
import { Navigate } from '@tanstack/react-router';
import { Lock } from 'lucide-react';
import { LinkButton } from '@/components/link-button';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { canOpen, roleLabels, type PageId } from '@/lib/access';
import { useMock } from '@/lib/mock/hooks';

type GuardedProps = {
  page: PageId;
  children: ReactNode;
};

/**
 * Wraps a restricted page. The wrong role gets a calm "no access" screen
 * instead of the page. A signed-out visitor to the dashboard goes to sign in.
 */
export function Guarded({ page, children }: GuardedProps) {
  const { role, setRole } = useMock();

  if (canOpen(role, page)) return <>{children}</>;

  if (role === 'signed-out' && page === 'dashboard') {
    return <Navigate to="/auth/sign-in" />;
  }

  const signedOut = role === 'signed-out';

  return (
    <Empty className="mx-auto mt-10 max-w-lg border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Lock />
        </EmptyMedia>
        <EmptyTitle>
          {signedOut
            ? 'Sign in to keep going.'
            : 'This page is in another workspace.'}
        </EmptyTitle>
        <EmptyDescription>
          {signedOut
            ? 'Browsing is open to everyone. Everything else needs an account.'
            : `You're viewing 3REco as ${roleLabels[role].toLowerCase()}. This page belongs to a different role.`}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {signedOut ? (
          <LinkButton to="/auth/sign-in">Sign in</LinkButton>
        ) : (
          <Button onClick={() => setRole('business')}>
            Preview as business
          </Button>
        )}
      </EmptyContent>
    </Empty>
  );
}
