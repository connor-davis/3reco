import { zodResolver } from '@hookform/resolvers/zod';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { TextField } from '@/components/form-fields';
import { Button } from '@/components/ui/button';
import { AuthShell } from './-components/auth-shell';

export const Route = createFileRoute('/auth/sign-up')({
  component: SignUpPage,
});

const schema = z.object({
  name: z.string().min(2, 'Enter your full name.'),
  email: z.string().email('Enter an email like you@company.co.za.'),
  password: z.string().min(8, 'Use at least 8 characters.'),
});

type Values = z.infer<typeof schema>;

function SignUpPage() {
  const navigate = useNavigate();
  const { control, handleSubmit } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', password: '' },
  });

  function onSubmit() {
    navigate({ to: '/auth/verify-email' });
  }

  return (
    <AuthShell
      title="Create your account."
      description="Join the community that gives materials a second life."
      footer={
        <p>
          Already have an account?{' '}
          <Link
            to="/auth/sign-in"
            className="font-medium text-foreground underline"
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
        <Button type="submit" className="w-full">
          Create account
        </Button>
      </form>
    </AuthShell>
  );
}
