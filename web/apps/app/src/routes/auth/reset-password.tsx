import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { TextField } from '@/components/form-fields';
import { Button } from '@/components/ui/button';
import { AuthShell } from './-components/auth-shell';

type TokenStatus = 'valid' | 'missing' | 'expired';

// The link's token is read from ?token=. Try ?token=expired or ?token=missing.
export const Route = createFileRoute('/auth/reset-password')({
  validateSearch: (
    search: Record<string, unknown>
  ): { token: TokenStatus } => ({
    token:
      search.token === 'missing' || search.token === 'expired'
        ? search.token
        : 'valid',
  }),
  component: ResetPasswordPage,
});

const schema = z.object({
  password: z.string().min(8, 'Use at least 8 characters.'),
});

type Values = z.infer<typeof schema>;

const tokenProblem: Record<Exclude<TokenStatus, 'valid'>, string> = {
  missing: 'This reset link is missing its token. Request a fresh email.',
  expired: 'This reset link has expired. Request a fresh email.',
};

function ResetPasswordPage() {
  const { token } = Route.useSearch();
  const [done, setDone] = useState(false);
  const { control, handleSubmit } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { password: '' },
  });

  const feedback =
    token !== 'valid'
      ? { tone: 'error' as const, text: tokenProblem[token] }
      : done
        ? {
            tone: 'info' as const,
            text: 'Password updated. You can now sign in.',
          }
        : null;

  return (
    <AuthShell
      title="Choose a new password."
      description="Pick something you have not used before."
      feedback={feedback}
      footer={
        <p>
          {token !== 'valid' && (
            <>
              <Link to="/auth/forgot-password" className="underline">
                Request a fresh email
              </Link>
              {' · '}
            </>
          )}
          <Link to="/auth/sign-in" className="underline">
            Return to sign in
          </Link>
        </p>
      }
    >
      <form
        onSubmit={handleSubmit(() => setDone(true))}
        className="space-y-4"
        noValidate
      >
        <TextField
          control={control}
          name="password"
          label="New password"
          type="password"
          autoComplete="new-password"
          disabled={token !== 'valid' || done}
        />
        <Button
          type="submit"
          className="w-full"
          disabled={token !== 'valid' || done}
        >
          {done ? 'Password updated' : 'Update password'}
        </Button>
      </form>
    </AuthShell>
  );
}
