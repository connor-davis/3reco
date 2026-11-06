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
import { useResetPassword } from '@/lib/api/auth';
import { showApiError } from '@/lib/form-errors';

// The emailed link carries the token in ?token=.
export const Route = createFileRoute('/reset-password')({
  validateSearch: (search: Record<string, unknown>): { token?: string } => ({
    token: typeof search.token === 'string' ? search.token : undefined,
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const schema = z.object({
    password: z.string().min(8, 'Use at least 8 characters.'),
  });

  type Values = z.infer<typeof schema>;

  const { token } = Route.useSearch();
  const navigate = useNavigate();
  const reset = useResetPassword();
  const [failure, setFailure] = useState<string | null>(null);
  const { control, handleSubmit, setError } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { password: '' },
  });

  function onSubmit({ password }: Values) {
    if (!token) return;

    setFailure(null);
    reset.mutate(
      { token, password },
      {
        onSuccess: () => {
          toast.success('Password updated. You can now sign in.');
          navigate({ to: '/sign-in' });
        },
        onError: (error) => setFailure(showApiError(error, setError)),
      }
    );
  }

  const problem = !token
    ? 'This reset link is incomplete. Request a new email.'
    : failure;

  return (
    <AuthShell
      title="Choose a new password."
      description="Pick something you have not used before."
      feedback={problem ? { tone: 'error', text: problem } : null}
      footer={
        <p>
          {problem && (
            <>
              <Link
                to="/forgot-password"
                className="inline-flex min-h-11 items-center underline"
              >
                Request a fresh email
              </Link>
              {' · '}
            </>
          )}
          <Link
            to="/sign-in"
            className="inline-flex min-h-11 items-center underline"
          >
            Return to sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <TextField
          control={control}
          name="password"
          label="New password"
          type="password"
          autoComplete="new-password"
          disabled={!token}
        />
        <Button
          type="submit"
          className="w-full"
          disabled={!token || reset.isPending}
        >
          {reset.isPending ? (
            <>
              <Spinner data-icon="inline-start" /> Updating…
            </>
          ) : (
            'Update password'
          )}
        </Button>
      </form>
    </AuthShell>
  );
}
