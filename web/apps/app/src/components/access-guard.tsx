import type { ReactNode } from 'react';
import { Navigate } from '@tanstack/react-router';
import { Lock } from 'lucide-react';
import { LinkButton } from '@/components/link-button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { RowsSkeleton } from '@/components/data-state';
import { canOpen, roleLabel, type PageId } from '@/lib/access';
import { useAuth } from '@/lib/auth/use-auth';

type GuardedProps = {
  page: PageId;
  children: ReactNode;
};

/**
 * Wraps a restricted page. The wrong role gets a calm "no access" screen
 * instead of the page. A signed-out visitor to the dashboard goes to sign in.
 */
export function Guarded({ page, children }: GuardedProps) {
  const { user, isLoading } = useAuth();

  if (isLoading) return <RowsSkeleton />;

  const role = user?.role ?? null;

  if (canOpen(role, page)) return <>{children}</>;

  if (!user && page === 'dashboard') return <Navigate to="/sign-in" />;

  return (
    <Empty className="mx-auto mt-10 max-w-lg border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Lock />
        </EmptyMedia>
        <EmptyTitle>
          {!user
            ? 'Sign in to keep going.'
            : role === 'guest'
              ? 'Finish your setup first.'
              : 'This page is in another workspace.'}
        </EmptyTitle>
        <EmptyDescription>
          {!user
            ? 'Browsing is open to everyone. Everything else needs an account.'
            : role === 'guest'
              ? 'Tell us how you will use 3REco and fill in your details. It takes a few minutes.'
              : `You're signed in as ${roleLabel(role)}. This page belongs to a different role.`}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {role === 'guest' ? (
          <LinkButton to="/setup">Finish setup</LinkButton>
        ) : user ? (
          <LinkButton to="/">Go to the dashboard</LinkButton>
        ) : (
          <LinkButton to="/sign-in">Sign in</LinkButton>
        )}
      </EmptyContent>
    </Empty>
  );
}
