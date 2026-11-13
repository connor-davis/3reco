import { useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AuthShell } from '@/components/auth-shell';
import { RowsSkeleton } from '@/components/data-state';
import { CheckboxField, TextField } from '@/components/form-fields';
import { Button } from '@/components/ui/button';
import { useAcceptInvite, useInvitePreview } from '@/lib/api/team';
import { useAuth } from '@/lib/auth/use-auth';
import { roleLabel } from '@/lib/access';
import { showApiError } from '@/lib/form-errors';

export const Route = createFileRoute('/accept-invite')({
  validateSearch: (search: Record<string, unknown>): { token?: string } => ({
    token: typeof search.token === 'string' ? search.token : undefined,
  }),
  component: AcceptInvitePage,
});

const schema = z.object({
  name: z.string().trim().min(2, 'Enter your full name.'),
  password: z.string().min(8, 'Use at least 8 characters.'),
  accepted: z.boolean().refine(Boolean, 'Accept the terms and privacy notice.'),
});

function AcceptInvitePage() {
  const { token } = Route.useSearch();
  const { user, isLoading } = useAuth();
  const preview = useInvitePreview(token);
  const accept = useAcceptInvite();
  const [joined, setJoined] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const { control, handleSubmit, setError } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', password: '', accepted: false },
  });
  const redirect = `/accept-invite?token=${encodeURIComponent(token ?? '')}`;

  function join(details?: z.infer<typeof schema>) {
    if (!token || accept.isPending) return;
    setFailure(null);
    accept.mutate(
      {
        token,
        ...(details
          ? {
              name: details.name,
              password: details.password,
              accepted_terms_version: '2026-11',
            }
          : {}),
      },
      {
        onSuccess: () => setJoined(true),
        onError: (error) => setFailure(showApiError(error, setError)),
      }
    );
  }

  const problem = !token
    ? 'This invitation link is incomplete. Ask an Owner for a new invitation.'
    : preview.isError
      ? preview.error.message
      : failure;
  return (
    <AuthShell
      title={joined ? 'You have joined the team.' : 'Join your team.'}
      description={
        preview.data
          ? `${preview.data.business_name} invited you as ${roleLabel(preview.data.role)} (${preview.data.email}).`
          : 'Use the invitation sent by your business.'
      }
      feedback={problem ? { tone: 'error', text: problem } : null}
      fullWidth
    >
      {joined ? (
        <div className="space-y-4">
          <p>
            Your current business stays selected if you already had one.
            Switching between businesses will be available in the next release.
          </p>
          {user ? (
            <Link
              to="/"
              className="inline-flex min-h-11 items-center underline"
            >
              Go to the dashboard
            </Link>
          ) : (
            <Link
              to="/sign-in"
              className="inline-flex min-h-11 items-center underline"
            >
              Sign in with your invited email
            </Link>
          )}
        </div>
      ) : isLoading || (token && preview.isPending) ? (
        <RowsSkeleton />
      ) : preview.data && !preview.isError ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Joining selects this business only if you have no current business.
            Otherwise your current business stays selected until switching is
            available in the next release.
          </p>
          {user ? (
            <div className="space-y-4">
              <p>
                Signed in as {user.email}. This must match the email address the
                invitation was sent to.
              </p>
              <Button disabled={accept.isPending} onClick={() => join()}>
                {accept.isPending ? 'Joining…' : 'Accept invitation'}
              </Button>
              <p>
                <Link
                  to="/sign-in"
                  search={{ redirect, add: true }}
                  className="inline-flex min-h-11 items-center underline"
                >
                  Use another account
                </Link>
              </p>
            </div>
          ) : (
            <>
              <p>
                <Link
                  to="/sign-in"
                  search={{ redirect }}
                  className="inline-flex min-h-11 items-center underline"
                >
                  Already have an account? Sign in with your invited email
                </Link>
              </p>
              <form
                className="space-y-4"
                noValidate
                onSubmit={handleSubmit((details) => join(details))}
              >
                <TextField
                  control={control}
                  name="name"
                  label="Full name"
                  personName
                  autoComplete="name"
                />
                <TextField
                  control={control}
                  name="password"
                  label="Password"
                  type="password"
                  autoComplete="new-password"
                  description="At least 8 characters. Your account uses the invited email address."
                />
                <CheckboxField
                  control={control}
                  name="accepted"
                  label={
                    <>
                      I accept the{' '}
                      <Link
                        to="/terms"
                        target="_blank"
                        rel="noopener"
                        className="underline"
                      >
                        terms
                      </Link>{' '}
                      and{' '}
                      <Link
                        to="/privacy"
                        target="_blank"
                        rel="noopener"
                        className="underline"
                      >
                        privacy notice
                      </Link>
                      .
                    </>
                  }
                />
                <Button type="submit" disabled={accept.isPending}>
                  {accept.isPending ? 'Joining…' : 'Create account and join'}
                </Button>
              </form>
            </>
          )}
        </div>
      ) : (
        <p>
          Ask an Owner for a new invitation if this link has expired, been used
          or been revoked.
        </p>
      )}
    </AuthShell>
  );
}
