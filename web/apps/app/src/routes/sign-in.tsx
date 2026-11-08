import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { AuthShell } from '@/components/auth-shell';
import { TextField } from '@/components/form-fields';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { ApiError } from '@/lib/api/client';
import { useSignIn } from '@/lib/api/auth';
import { showApiError } from '@/lib/form-errors';
import { authDestination } from '@/lib/auth/redirect';

export const Route = createFileRoute('/sign-in')({
  validateSearch: (search: Record<string, unknown>) => ({
    ...(typeof search.email === 'string' ? { email: search.email } : {}),
    ...(search.add === true ||
    search.add === 'true' ||
    search.add === 1 ||
    search.add === '1'
      ? { add: true }
      : {}),
    ...(typeof search.redirect === 'string'
      ? { redirect: search.redirect }
      : {}),
    ...(search.reason === 'ended' || search.reason === 'removed'
      ? { reason: search.reason }
      : {}),
  }),
  component: SignInPage,
});

function SignInPage() {
  const schema = z.object({
    email: z.string().email('Enter an email like you@company.co.za.'),
    password: z.string().min(1, 'Enter your password.'),
  });

  type Values = z.infer<typeof schema>;

  const navigate = useNavigate();
  // The live socket names why access ended so people know what happened.
  const params = new URLSearchParams(window.location.search);
  const addingAccount = ['true', '1'].includes(params.get('add') ?? '');
  const reason = params.get('reason');
  const ended = reason === 'ended';
  const signIn = useSignIn();
  const [failure, setFailure] = useState<string | null>(null);
  const [unverified, setUnverified] = useState<string | null>(null);

  const { control, handleSubmit, setError, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: params.get('email') ?? '', password: '' },
  });

  function onSubmit(values: Values) {
    setFailure(null);
    setUnverified(null);

    signIn.mutate(values, {
      onSuccess: (data) => {
        // Someone who has not finished setup is new, not coming back.
        toast.success(
          data.user.role === 'guest' ? 'Welcome.' : 'Welcome back.'
        );
        navigate({ to: authDestination(params.get('redirect')) });
      },
      onError: (error) => {
        // The API says so when the email is not verified yet; offer the way on.
        if (error instanceof ApiError && error.code === 'email_not_verified') {
          setUnverified(values.email);
        }
        setFailure(showApiError(error, setError));
      },
    });
  }

  return (
    <AuthShell
      title={
        addingAccount
          ? 'Add another account.'
          : reason === 'removed'
            ? 'Account removed.'
            : 'Welcome back.'
      }
      description={
        reason === 'removed'
          ? ''
          : 'Sign in to trade, chat and track your stock.'
      }
      feedback={
        failure
          ? { tone: 'error', text: failure }
          : reason === 'removed'
            ? {
                tone: 'info',
                text: 'This account was removed.',
              }
            : ended
              ? {
                  tone: 'info',
                  text: 'You were signed out because your account changed.',
                }
              : null
      }
      footer={
        <>
          {addingAccount && (
            <p>
              <Link
                to={authDestination(params.get('redirect'))}
                className="inline-flex min-h-11 items-center font-medium text-foreground underline"
              >
                Cancel and go back
              </Link>
            </p>
          )}
          <p>
            New to 3REco?{' '}
            <Link
              to="/sign-up"
              className="inline-flex min-h-11 items-center font-medium text-foreground underline"
            >
              Create an account
            </Link>
          </p>
          {unverified && (
            <p>
              <Link
                to="/verify-email"
                search={{ email: unverified }}
                className="inline-flex min-h-11 items-center font-medium text-foreground underline"
              >
                Send the verification email again
              </Link>
            </p>
          )}
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <TextField
          control={control}
          name="email"
          label="Email address"
          type="email"
          autoComplete="email"
          placeholder="you@company.co.za"
        />
        <TextField
          control={control}
          name="password"
          label="Password"
          type="password"
          autoComplete="current-password"
        />
        <div className="text-right">
          <Link
            to="/forgot-password"
            className="inline-flex min-h-11 items-center text-sm underline"
          >
            Forgot password?
          </Link>
        </div>
        <Button type="submit" className="w-full" disabled={signIn.isPending}>
          {signIn.isPending || formState.isSubmitting ? (
            <>
              <Spinner data-icon="inline-start" /> Please wait…
            </>
          ) : (
            'Sign in'
          )}
        </Button>
      </form>
    </AuthShell>
  );
}
