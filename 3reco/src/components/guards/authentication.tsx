import { useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import z from 'zod/v4';
import { toast } from 'sonner';
import { KeyRoundIcon, QrCodeIcon, ShieldCheckIcon } from 'lucide-react';

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
import { convexQuery } from '@convex-dev/react-query';
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
    factors: AuthFactor[];
    selectedFactor: AuthFactor | null;
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
          factors: result.authFactors,
          selectedFactor: result.authFactors[0] ?? null,
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
    if (!pendingMfa?.selectedFactor) return;
    try {
      await verifyMfa(
        pendingMfa.token,
        pendingMfa.selectedFactor.id,
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
    const isTOTP = pendingMfa.selectedFactor?.type === 'totp';
    return (
      <div className="flex flex-col w-screen h-screen items-center justify-center bg-background">
        <Card className="max-w-96 w-full gap-10">
          <CardHeader>
            <div className="flex justify-center mb-2">
              {isTOTP ? (
                <ShieldCheckIcon className="size-10 text-primary" />
              ) : (
                <KeyRoundIcon className="size-10 text-primary" />
              )}
            </div>
            <CardTitle className="text-center">
              Two-Factor Authentication
            </CardTitle>
            <CardDescription>
              {isTOTP
                ? 'Enter the 6-digit code from your authenticator app.'
                : 'Use your passkey to verify your identity.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {/* Factor selector if user has multiple */}
            {pendingMfa.factors.length > 1 && (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">
                  Choose a verification method:
                </p>
                <div className="flex gap-2 flex-wrap">
                  {pendingMfa.factors.map((f) => (
                    <Button
                      key={f.id}
                      variant={
                        pendingMfa.selectedFactor?.id === f.id
                          ? 'default'
                          : 'outline'
                      }
                      size="sm"
                      onClick={() =>
                        setPendingMfa((p) =>
                          p ? { ...p, selectedFactor: f } : p,
                        )
                      }
                    >
                      {f.type === 'totp'
                        ? 'Authenticator App'
                        : f.type === 'webauthn'
                          ? 'Passkey'
                          : f.type}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {isTOTP && (
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
            )}

            {!isTOTP && (
              <p className="text-sm text-muted-foreground text-center">
                Passkey authentication is initiated automatically by your
                browser.
              </p>
            )}

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

const formSchema = z.object({
  email: z.string().min(10).max(100),
  password: z.string().min(8).optional(),
});

export default function AuthenticationGuard() {
  const router = useRouter();
  const { signIn } = useAuthActions();

  const [tab, setTab] = useState<'signIn' | 'signUp'>('signIn');

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  return (
    <Tabs value={tab} className="flex flex-col w-screen h-screen bg-background">
      <TabsContent value="signIn">
        <div className="flex flex-col w-full h-full items-center justify-center">
          <Card className="max-w-96 w-full gap-10">
            <CardHeader>
              <CardTitle className="text-center">Sign In</CardTitle>
              <CardDescription>
                Please use your existing email and password to sign in to the
                application.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col w-full h-auto gap-10">
              <form
                id="form-sign-in"
                onSubmit={form.handleSubmit(async (values) => {
                  if (!values.password)
                    return toast.error('Uh Oh!', {
                      description: 'Please enter a valid password...',
                      duration: 2000,
                    });

                  const formData = new FormData();

                  formData.append('email', values.email);
                  formData.append('password', values.password);
                  formData.append('flow', 'signIn');

                  signIn('password', formData)
                    .then(() => router.navigate({ to: '/' }))
                    .catch((error) => {
                      if (error instanceof ConvexError) {
                        return toast.error(error.data.name, {
                          description: error.data.message,
                          duration: 2000,
                        });
                      }

                      return toast.error(error.name, {
                        description: error.message,
                        duration: 2000,
                      });
                    });
                })}
                className="flex flex-col w-full h-auto gap-5"
              >
                <FieldGroup>
                  <Controller
                    name="email"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="form-sign-in-email">
                          Email
                        </FieldLabel>
                        <Input
                          {...field}
                          id="form-sign-in-email"
                          aria-invalid={fieldState.invalid}
                          placeholder="Email"
                          autoComplete="email"
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                        <FieldDescription>
                          Please enter your email address.
                        </FieldDescription>
                      </Field>
                    )}
                  />

                  <Controller
                    name="password"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="form-sign-in-password">
                          Password
                        </FieldLabel>
                        <Input
                          {...field}
                          id="form-sign-in-password"
                          aria-invalid={fieldState.invalid}
                          placeholder="Password"
                          type="password"
                          autoComplete="current-password"
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                        <FieldDescription>
                          Please enter your password.
                        </FieldDescription>
                      </Field>
                    )}
                  />
                </FieldGroup>

                <Button type="submit">Sign In</Button>
              </form>

              <p>
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
      <TabsContent value="signUp">
        <div className="flex flex-col w-full h-full items-center justify-center">
          <Card className="max-w-96 w-full gap-10">
            <CardHeader>
              <CardTitle className="text-center">Sign Up</CardTitle>
              <CardDescription>
                Please enter your email address and password below to create a
                new account.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col w-full h-auto gap-10">
              <form
                id="form-sign-up"
                onSubmit={form.handleSubmit(async (values) => {
                  if (!values.password)
                    return toast.error('Uh Oh!', {
                      description: 'Please enter a valid password...',
                      duration: 2000,
                    });

                  signIn('password', {
                    flow: 'signUp',
                    ...values,
                    agreedToTerms: false,
                    profileComplete: false,
                  })
                    .then(() => router.navigate({ to: '/' }))
                    .catch((error) => {
                      if (error instanceof ConvexError) {
                        return toast.error(error.data.name, {
                          description: error.data.message,
                          duration: 2000,
                        });
                      }

                      return toast.error(error.name, {
                        description: error.message,
                        duration: 2000,
                      });
                    });
                })}
                className="flex flex-col w-full h-auto gap-5"
              >
                <FieldGroup>
                  <Controller
                    name="email"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="form-sign-up-email">
                          Email
                        </FieldLabel>
                        <Input
                          {...field}
                          id="form-sign-up-email"
                          aria-invalid={fieldState.invalid}
                          placeholder="Email"
                          autoComplete="email"
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                        <FieldDescription>
                          Please enter your email address.
                        </FieldDescription>
                      </Field>
                    )}
                  />

                  <Controller
                    name="password"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="form-sign-up-password">
                          Password
                        </FieldLabel>
                        <Input
                          {...field}
                          id="form-sign-up-password"
                          aria-invalid={fieldState.invalid}
                          placeholder="Password"
                          type="password"
                          autoComplete="current-password"
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                        <FieldDescription>
                          Please enter your password.
                        </FieldDescription>
                      </Field>
                    )}
                  />
                </FieldGroup>

                <Button type="submit">Sign Up</Button>
              </form>

              <p>
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
