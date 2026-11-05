import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Lock } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { TextField } from '@/components/form-fields';
import { Button } from '@/components/ui/button';
import { AuthShell } from './-components/auth-shell';

export const Route = createFileRoute('/auth/forgot-password')({
  component: ForgotPasswordPage,
});

const schema = z.object({
  email: z.string().email('Enter an email like you@company.co.za.'),
});

type Values = z.infer<typeof schema>;

function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const { control, handleSubmit } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  });

  return (
    <AuthShell
      title="Forgot your password?"
      description="Enter your email and we will send you a link."
      feedback={
        sent
          ? {
              tone: 'info',
              // Generic on purpose, so nobody can tell which emails exist.
              text: 'If this account exists, a reset link has been sent. Check your inbox.',
            }
          : null
      }
      footer={
        <p>
          <Link to="/auth/sign-in" className="underline">
            Return to sign in
          </Link>
          {' · '}
          <Link to="/auth/sign-up" className="underline">
            Create account
          </Link>
        </p>
      }
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-muted">
        <Lock className="size-5" aria-hidden="true" />
      </span>
      <form
        onSubmit={handleSubmit(() => setSent(true))}
        className="space-y-4"
        noValidate
      >
        <TextField
          control={control}
          name="email"
          label="Email address"
          type="email"
          autoComplete="email"
          placeholder="you@company.co.za"
        />
        <Button type="submit" className="w-full">
          Send reset link
        </Button>
      </form>
    </AuthShell>
  );
}
