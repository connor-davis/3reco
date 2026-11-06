import { useEffect, useRef, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { MailCheck } from 'lucide-react';
import { toast } from 'sonner';
import { AuthShell } from '@/components/auth-shell';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSendVerification, useVerifyEmail } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';

// The emailed link carries ?token=. Sign-up and sign-in send ?email= so the
// page can offer to send the link again.
export const Route = createFileRoute('/verify-email')({
  validateSearch: (
    search: Record<string, unknown>
  ): { token?: string; email?: string } => ({
    token: typeof search.token === 'string' ? search.token : undefined,
    email: typeof search.email === 'string' ? search.email : undefined,
  }),
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const { token, email } = Route.useSearch();
  const verify = useVerifyEmail();
  const send = useSendVerification();
  const [resendEmail, setResendEmail] = useState(email ?? '');
  // A token works once, so StrictMode's second effect run must not resend it.
  const sentToken = useRef<string | null>(null);

  useEffect(() => {
    if (!token || sentToken.current === token) return;

    sentToken.current = token;
    verify.mutate(token);
  }, [token, verify]);

  const failure =
    verify.error instanceof ApiError
      ? verify.error.message
      : verify.isError
        ? 'We could not reach the server. Check your connection and try again.'
        : null;

  return (
    <AuthShell
      title={
        verify.isSuccess
          ? 'Email verified.'
          : failure
            ? 'This link could not be verified.'
            : token
              ? 'Verifying your email.'
              : 'Check your email.'
      }
      description={
        verify.isSuccess
          ? 'Your email is confirmed. Sign in to continue.'
          : failure
            ? 'Enter your email below to request a new link.'
            : token
              ? 'One moment while we check your link.'
              : email
                ? `We sent a verification link to ${email}.`
                : 'We sent you a verification link.'
      }
      feedback={
        verify.isSuccess
          ? { tone: 'info', text: 'Email verified. You can now sign in.' }
          : failure
            ? { tone: 'error', text: failure }
            : null
      }
      footer={
        <p>
          <Link
            to="/sign-in"
            className="inline-flex min-h-11 items-center underline"
          >
            {verify.isSuccess ? 'Sign in' : 'Return to sign in'}
          </Link>
        </p>
      }
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-muted">
        {verify.isPending ? (
          <Spinner aria-label="Verifying" />
        ) : (
          <MailCheck className="size-5" aria-hidden="true" />
        )}
      </span>
      {(!token || failure) && (
        <>
          <p className="text-sm text-muted-foreground">
            Check your spam folder too.
          </p>
          <form
            className="w-full space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              send.mutate(resendEmail.trim(), {
                onSuccess: () =>
                  toast.success(
                    'If this email needs verification, we have sent a link. Check your inbox.'
                  ),
                onError: () =>
                  toast.error('We could not send the email. Try again.'),
              });
            }}
          >
            <Label htmlFor="verification-email">Email</Label>
            <Input
              id="verification-email"
              type="email"
              autoComplete="email"
              required
              value={resendEmail}
              onChange={(event) => setResendEmail(event.target.value)}
            />
            <Button type="submit" className="w-full" disabled={send.isPending}>
              {send.isPending ? (
                <>
                  <Spinner data-icon="inline-start" /> Sending…
                </>
              ) : (
                'Resend verification email'
              )}
            </Button>
          </form>
        </>
      )}
    </AuthShell>
  );
}
