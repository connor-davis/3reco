import { useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import z from 'zod/v4';
import { toast } from 'sonner';
import { ShieldCheckIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { useWorkOSAuth, type AuthFactor } from '@/components/providers/workos-auth';
import { api } from '@convex/_generated/api';
import { useConvexMutation } from '@convex-dev/react-query';

// ─── Schemas ─────────────────────────────────────────────────────────────────

const signInSchema = z.object({
  email: z.string().min(1).max(200),
  password: z.string().min(8),
});

const signUpSchema = z.object({
  email: z.string().min(1).max(200),
  password: z.string().min(8),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
});

const mfaSchema = z.object({
  code: z.string().min(6).max(8),
});

// ─── Component ───────────────────────────────────────────────────────────────

export default function AuthenticationGuard() {
  const router = useRouter();
  const { signIn, signUp, verifyMfa } = useWorkOSAuth();
  const upsertFromWorkOS = useConvexMutation(api.users.upsertFromWorkOS);

  const [tab, setTab] = useState<'signIn' | 'signUp'>('signIn');

  // MFA state: set when the server returns requiresMfa
  const [pendingMfa, setPendingMfa] = useState<{
    token: string;
    challengeId: string | null;
    factors: AuthFactor[];
  } | null>(null);

  const signInForm = useForm<z.infer<typeof signInSchema>>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });

  const signUpForm = useForm<z.infer<typeof signUpSchema>>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { email: '', password: '', firstName: '', lastName: '' },
  });

  const mfaForm = useForm<z.infer<typeof mfaSchema>>({
    resolver: zodResolver(mfaSchema),
    defaultValues: { code: '' },
  });

  /** Called after tokens are obtained — sync user record then navigate. */
  const onAuthenticated = async (userInfo: {
    workosUserId: string;
    email: string;
    firstName?: string;
    lastName?: string;
    role?: string;
  }) => {
    try {
      await upsertFromWorkOS({
        email: userInfo.email,
        firstName: userInfo.firstName,
        lastName: userInfo.lastName,
        role: userInfo.role,
      });
    } catch {
      // upsert failure is non-fatal; profile can be completed later
    }
    router.navigate({ to: '/' });
  };

  // ── Sign In ────────────────────────────────────────────────────────────

  const handleSignIn = signInForm.handleSubmit(async ({ email, password }) => {
    try {
      const result = await signIn(email, password);
      if ('requiresMfa' in result && result.requiresMfa) {
        setPendingMfa({
          token: result.pendingAuthToken,
          challengeId: result.challengeId ?? null,
          factors: result.authFactors,
        });
        return;
      }
      await onAuthenticated({ workosUserId: '', email });
    } catch (e: any) {
      toast.error('Sign in failed', { description: e?.message });
    }
  });

  // ── Sign Up ────────────────────────────────────────────────────────────

  const handleSignUp = signUpForm.handleSubmit(
    async ({ email, password, firstName, lastName }) => {
      try {
        await signUp(email, password, firstName, lastName);
        await onAuthenticated({ workosUserId: '', email, firstName, lastName });
      } catch (e: any) {
        toast.error('Sign up failed', { description: e?.message });
      }
    },
  );

  // ── MFA verify ────────────────────────────────────────────────────────

  const handleMfaVerify = mfaForm.handleSubmit(async ({ code }) => {
    if (!pendingMfa?.challengeId) return;
    try {
      await verifyMfa(
        pendingMfa.token,
        pendingMfa.challengeId,
        code,
      );
      setPendingMfa(null);
      router.navigate({ to: '/' });
    } catch (e: any) {
      toast.error('Verification failed', { description: e?.message });
    }
  });

  // ── MFA screen ────────────────────────────────────────────────────────

  if (pendingMfa) {
    return (
      <div className="flex flex-col w-screen h-screen items-center justify-center bg-background">
        <Card className="max-w-96 w-full gap-10">
          <CardHeader>
            <div className="flex justify-center mb-2">
              <ShieldCheckIcon className="size-10 text-primary" />
            </div>
            <CardTitle className="text-center">
              Two-Factor Authentication
            </CardTitle>
            <CardDescription>
              Enter the 6-digit code from your authenticator app.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <form
              onSubmit={handleMfaVerify}
              className="flex flex-col gap-4"
            >
              <Field>
                <FieldLabel htmlFor="mfa-code">Verification Code</FieldLabel>
                <Controller
                  name="code"
                  control={mfaForm.control}
                  render={({ field, fieldState }) => (
                    <>
                      <Input
                        {...field}
                        id="mfa-code"
                        placeholder="000000"
                        autoComplete="one-time-code"
                        inputMode="numeric"
                        maxLength={8}
                        aria-invalid={fieldState.invalid}
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </>
                  )}
                />
              </Field>
              <Button type="submit">Verify</Button>
            </form>

            <Button variant="ghost" onClick={() => setPendingMfa(null)}>
              Cancel
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Sign In / Sign Up tabs ────────────────────────────────────────────

  return (
    <Tabs
      value={tab}
      className="flex flex-col w-screen h-screen bg-background"
    >
      {/* Sign In */}
      <TabsContent value="signIn">
        <div className="flex flex-col w-full h-full items-center justify-center">
          <Card className="max-w-96 w-full gap-10">
            <CardHeader>
              <CardTitle className="text-center">Sign In</CardTitle>
              <CardDescription>
                Enter your email and password to sign in.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col w-full h-auto gap-10">
              <form
                id="form-sign-in"
                onSubmit={handleSignIn}
                className="flex flex-col w-full h-auto gap-5"
              >
                <FieldGroup>
                  <Controller
                    name="email"
                    control={signInForm.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="sign-in-email">Email</FieldLabel>
                        <Input
                          {...field}
                          id="sign-in-email"
                          type="email"
                          placeholder="you@example.com"
                          autoComplete="email"
                          aria-invalid={fieldState.invalid}
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                        <FieldDescription>
                          Enter your email address.
                        </FieldDescription>
                      </Field>
                    )}
                  />
                  <Controller
                    name="password"
                    control={signInForm.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="sign-in-password">
                          Password
                        </FieldLabel>
                        <Input
                          {...field}
                          id="sign-in-password"
                          type="password"
                          placeholder="••••••••"
                          autoComplete="current-password"
                          aria-invalid={fieldState.invalid}
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />
                </FieldGroup>
                <Button type="submit">Sign In</Button>
              </form>

              <p className="text-sm">
                Don't have an account?{' '}
                <span
                  className="text-primary cursor-pointer"
                  onClick={() => setTab('signUp')}
                >
                  Sign Up
                </span>
              </p>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      {/* Sign Up */}
      <TabsContent value="signUp">
        <div className="flex flex-col w-full h-full items-center justify-center">
          <Card className="max-w-96 w-full gap-10">
            <CardHeader>
              <CardTitle className="text-center">Sign Up</CardTitle>
              <CardDescription>
                Create a new account to get started.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col w-full h-auto gap-10">
              <form
                id="form-sign-up"
                onSubmit={handleSignUp}
                className="flex flex-col w-full h-auto gap-5"
              >
                <FieldGroup>
                  <div className="flex gap-3">
                    <Controller
                      name="firstName"
                      control={signUpForm.control}
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor="sign-up-first-name">
                            First Name
                          </FieldLabel>
                          <Input
                            {...field}
                            id="sign-up-first-name"
                            placeholder="Jane"
                            autoComplete="given-name"
                            aria-invalid={fieldState.invalid}
                          />
                          {fieldState.invalid && (
                            <FieldError errors={[fieldState.error]} />
                          )}
                        </Field>
                      )}
                    />
                    <Controller
                      name="lastName"
                      control={signUpForm.control}
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor="sign-up-last-name">
                            Last Name
                          </FieldLabel>
                          <Input
                            {...field}
                            id="sign-up-last-name"
                            placeholder="Smith"
                            autoComplete="family-name"
                            aria-invalid={fieldState.invalid}
                          />
                          {fieldState.invalid && (
                            <FieldError errors={[fieldState.error]} />
                          )}
                        </Field>
                      )}
                    />
                  </div>
                  <Controller
                    name="email"
                    control={signUpForm.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="sign-up-email">Email</FieldLabel>
                        <Input
                          {...field}
                          id="sign-up-email"
                          type="email"
                          placeholder="you@example.com"
                          autoComplete="email"
                          aria-invalid={fieldState.invalid}
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                        <FieldDescription>
                          Enter your email address.
                        </FieldDescription>
                      </Field>
                    )}
                  />
                  <Controller
                    name="password"
                    control={signUpForm.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="sign-up-password">
                          Password
                        </FieldLabel>
                        <Input
                          {...field}
                          id="sign-up-password"
                          type="password"
                          placeholder="••••••••"
                          autoComplete="new-password"
                          aria-invalid={fieldState.invalid}
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                        <FieldDescription>
                          At least 8 characters.
                        </FieldDescription>
                      </Field>
                    )}
                  />
                </FieldGroup>
                <Button type="submit">Sign Up</Button>
              </form>

              <p className="text-sm">
                Already have an account?{' '}
                <span
                  className="text-primary cursor-pointer"
                  onClick={() => setTab('signIn')}
                >
                  Sign In
                </span>
              </p>
            </CardContent>
          </Card>
        </div>
      </TabsContent>
    </Tabs>
  );
}
