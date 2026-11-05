import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { CollectorLookupDialog } from '@/components/dialogs/collector-lookup-dialog';
import { CheckboxField, TextField } from '@/components/form-fields';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useMock } from '@/lib/mock/hooks';
import { AuthShell } from './-components/auth-shell';

export const Route = createFileRoute('/auth/sign-in')({
  component: SignInPage,
});

const schema = z.object({
  email: z.string().email('Enter an email like you@company.co.za.'),
  password: z.string().min(1, 'Enter your password.'),
  keep: z.boolean(),
});

type Values = z.infer<typeof schema>;

function SignInPage() {
  const { setRole } = useMock();
  const navigate = useNavigate();
  const [lookupOpen, setLookupOpen] = useState(false);
  const [failed, setFailed] = useState(false);

  const { control, handleSubmit, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '', keep: true },
  });

  async function onSubmit(values: Values) {
    setFailed(false);
    await new Promise((resolve) => setTimeout(resolve, 600));

    // The preview rejects one password so the error state can be seen.
    if (values.password === 'wrong-password') {
      setFailed(true);
      return;
    }

    setRole('business');
    toast.success('Welcome back.');
    navigate({ to: '/' });
  }

  return (
    <AuthShell
      title="Welcome back."
      description="Sign in to trade, chat and track your stock."
      feedback={
        failed
          ? {
              tone: 'error',
              text: "We couldn't complete that request. Check your details and try again.",
            }
          : null
      }
      footer={
        <>
          <p>
            New to 3REco?{' '}
            <Link
              to="/auth/sign-up"
              className="font-medium text-foreground underline"
            >
              Create an account
            </Link>
          </p>
          <Button variant="link" onClick={() => setLookupOpen(true)}>
            Link a collector account
          </Button>
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
          description="Type wrong-password to see the error."
        />
        <div className="flex items-center justify-between gap-2">
          <CheckboxField
            control={control}
            name="keep"
            label="Keep me signed in"
          />
          <Link to="/auth/forgot-password" className="text-sm underline">
            Forgot password?
          </Link>
        </div>
        <Button
          type="submit"
          className="w-full"
          disabled={formState.isSubmitting}
        >
          {formState.isSubmitting ? (
            <>
              <Spinner data-icon="inline-start" /> Please wait…
            </>
          ) : (
            'Sign in'
          )}
        </Button>
      </form>
      <CollectorLookupDialog open={lookupOpen} onOpenChange={setLookupOpen} />
    </AuthShell>
  );
}
