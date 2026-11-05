import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AuthShell } from '@/components/auth-shell';
import { CheckboxField, TextField } from '@/components/form-fields';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useSignUp } from '@/lib/api/auth';
import { showApiError } from '@/lib/form-errors';

export const Route = createFileRoute('/sign-up')({
  component: SignUpPage,
});

// The terms version the API accepts (internal/platform/config/privacy.go).
const TERMS_VERSION = '2026-11';

function SignUpPage() {
  const schema = z.object({
    name: z.string().min(2, 'Enter your full name.'),
    email: z.string().email('Enter an email like you@company.co.za.'),
    password: z.string().min(8, 'Use at least 8 characters.'),
    accepted: z
      .boolean()
      .refine(Boolean, 'Accept the terms to create an account.'),
  });

  type Values = z.infer<typeof schema>;

  const navigate = useNavigate();
  const signUp = useSignUp();
  const [failure, setFailure] = useState<string | null>(null);
  const { control, handleSubmit, setError } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', password: '', accepted: false },
  });

  function onSubmit({ name, email, password }: Values) {
    setFailure(null);

    signUp.mutate(
      { name, email, password, accepted_terms_version: TERMS_VERSION },
      {
        // The API answers the same for a new and an existing email.
        onSuccess: () => navigate({ to: '/verify-email', search: { email } }),
        onError: (error) => setFailure(showApiError(error, setError)),
      }
    );
  }

  return (
    <AuthShell
      title="Create your account."
      description="Join the community that gives materials a second life."
      feedback={failure ? { tone: 'error', text: failure } : null}
      footer={
        <p>
          Already have an account?{' '}
          <Link
            to="/sign-in"
            className="inline-flex min-h-11 items-center font-medium text-foreground underline"
          >
            Sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <TextField
          control={control}
          name="name"
          label="Full name"
          autoComplete="name"
        />
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
          autoComplete="new-password"
          description="At least 8 characters."
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
        <Button type="submit" className="w-full" disabled={signUp.isPending}>
          {signUp.isPending ? (
            <>
              <Spinner data-icon="inline-start" /> Please wait…
            </>
          ) : (
            'Create account'
          )}
        </Button>
      </form>
    </AuthShell>
  );
}
