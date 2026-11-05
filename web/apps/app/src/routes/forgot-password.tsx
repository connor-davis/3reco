import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Lock } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AuthShell } from '@/components/auth-shell';
import { TextField } from '@/components/form-fields';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useForgotPassword } from '@/lib/api/auth';
import { showApiError } from '@/lib/form-errors';

export const Route = createFileRoute('/forgot-password')({
  component: ForgotPasswordPage,
});

const schema = z.object({
  email: z.string().email('Enter an email like you@company.co.za.'),
});

type Values = z.infer<typeof schema>;

function ForgotPasswordPage() {
  const forgot = useForgotPassword();
  const [failure, setFailure] = useState<string | null>(null);
  const { control, handleSubmit, setError } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  });

  function onSubmit({ email }: Values) {
    setFailure(null);
    forgot.mutate(email, {
      onError: (error) => setFailure(showApiError(error, setError)),
    });
  }

  return (
    <AuthShell
      title="Forgot your password?"
      description="Enter your email and we will send you a link."
      feedback={
        failure
          ? { tone: 'error', text: failure }
          : forgot.isSuccess
            ? {
                tone: 'info',
                // Generic on purpose, so nobody can tell which emails exist.
                text: 'If this account exists, a reset link has been sent. Check your inbox.',
              }
            : null
      }
      footer={
        <p>
          <Link
            to="/sign-in"
            className="inline-flex min-h-11 items-center underline"
          >
            Return to sign in
          </Link>
          {' · '}
          <Link
            to="/sign-up"
            className="inline-flex min-h-11 items-center underline"
          >
            Create account
          </Link>
        </p>
      }
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-muted">
        <Lock className="size-5" aria-hidden="true" />
      </span>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <TextField
          control={control}
          name="email"
          label="Email address"
          type="email"
          autoComplete="email"
          placeholder="you@company.co.za"
        />
        <Button type="submit" className="w-full" disabled={forgot.isPending}>
          {forgot.isPending ? (
            <>
              <Spinner data-icon="inline-start" /> Sending…
            </>
          ) : (
            'Send reset link'
          )}
        </Button>
      </form>
    </AuthShell>
  );
}
