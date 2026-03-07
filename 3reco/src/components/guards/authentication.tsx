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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

const phoneSignInSchema = z.object({
  phone: z.string().min(7).max(20),
  password: z.string().min(8),
});

const phoneSignUpSchema = z.object({
  phone: z.string().min(7).max(20),
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
  const { signIn, signUp, phoneSignIn, phoneSignUp, verifyMfa } =
    useWorkOSAuth();
  const upsertFromWorkOS = useConvexMutation(api.users.upsertFromWorkOS);

  // Top-level tab: email | phone
  const [authMethod, setAuthMethod] = useState<'email' | 'phone'>('email');
  // Per-method sub-tab: signIn | signUp
  const [emailTab, setEmailTab] = useState<'signIn' | 'signUp'>('signIn');
  const [phoneTab, setPhoneTab] = useState<'signIn' | 'signUp'>('signIn');

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

  const phoneSignInForm = useForm<z.infer<typeof phoneSignInSchema>>({
    resolver: zodResolver(phoneSignInSchema),
    defaultValues: { phone: '', password: '' },
  });

  const phoneSignUpForm = useForm<z.infer<typeof phoneSignUpSchema>>({
    resolver: zodResolver(phoneSignUpSchema),
    defaultValues: { phone: '', password: '', firstName: '', lastName: '' },
  });

  const mfaForm = useForm<z.infer<typeof mfaSchema>>({
    resolver: zodResolver(mfaSchema),
    defaultValues: { code: '' },
  });

  /** Called after tokens are stored — sync user record then navigate home. */
  const onAuthenticated = async (userInfo: {
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
    role?: string;
  }) => {
    try {
      await upsertFromWorkOS({
        email: userInfo.email,
        phone: userInfo.phone,
        firstName: userInfo.firstName,
        lastName: userInfo.lastName,
        role: userInfo.role,
      });
    } catch {
      // upsert failure is non-fatal; profile can be completed later
    }
    router.navigate({ to: '/' });
  };

  // ── Email sign-in ──────────────────────────────────────────────────────

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
      await onAuthenticated({ email });
    } catch (e: any) {
      toast.error('Sign in failed', { description: e?.message });
    }
  });

  // ── Email sign-up ──────────────────────────────────────────────────────

  const handleSignUp = signUpForm.handleSubmit(
    async ({ email, password, firstName, lastName }) => {
      try {
        await signUp(email, password, firstName, lastName);
        await onAuthenticated({ email, firstName, lastName });
      } catch (e: any) {
        toast.error('Sign up failed', { description: e?.message });
      }
    },
  );

  // ── Phone sign-in ──────────────────────────────────────────────────────

  const handlePhoneSignIn = phoneSignInForm.handleSubmit(
    async ({ phone, password }) => {
      try {
        const result = await phoneSignIn(phone, password);
        if ('requiresMfa' in result && result.requiresMfa) {
          setPendingMfa({
            token: result.pendingAuthToken,
            challengeId: result.challengeId ?? null,
            factors: result.authFactors,
          });
          return;
        }
        await onAuthenticated({ phone });
      } catch (e: any) {
        toast.error('Sign in failed', { description: e?.message });
      }
    },
  );

  // ── Phone sign-up ──────────────────────────────────────────────────────

  const handlePhoneSignUp = phoneSignUpForm.handleSubmit(
    async ({ phone, password, firstName, lastName }) => {
      try {
        await phoneSignUp(phone, password, firstName, lastName);
        await onAuthenticated({ phone, firstName, lastName });
      } catch (e: any) {
        toast.error('Sign up failed', { description: e?.message });
      }
    },
  );

  // ── MFA verify ────────────────────────────────────────────────────────

  const handleMfaVerify = mfaForm.handleSubmit(async ({ code }) => {
    if (!pendingMfa?.challengeId) return;
    try {
      await verifyMfa(pendingMfa.token, pendingMfa.challengeId, code);
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
            <form onSubmit={handleMfaVerify} className="flex flex-col gap-4">
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

  // ── Main auth screen ─────────────────────────────────────────────────

  return (
    <div className="flex flex-col w-screen h-screen items-center justify-center bg-background">
      <Card className="max-w-md w-full gap-6">
        {/* Auth method selector: Email / Phone */}
        <CardHeader className="pb-0">
          <Tabs
            value={authMethod}
            onValueChange={(v) => setAuthMethod(v as 'email' | 'phone')}
          >
            <TabsList className="w-full">
              <TabsTrigger value="email" className="flex-1">
                Email
              </TabsTrigger>
              <TabsTrigger value="phone" className="flex-1">
                Phone Number
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>

        <CardContent className="pt-0">
          {/* ── Email flows ──────────────────────────────────────────── */}
          {authMethod === 'email' && (
            <Tabs
              value={emailTab}
              className="flex flex-col gap-0"
            >
              {/* Email sign-in */}
              <TabsContent value="signIn">
                <div className="flex flex-col gap-6">
                  <div>
                    <CardTitle className="text-center mb-1">Sign In</CardTitle>
                    <CardDescription className="text-center">
                      Enter your email and password to sign in.
                    </CardDescription>
                  </div>
                  <form
                    onSubmit={handleSignIn}
                    className="flex flex-col gap-5"
                  >
                    <FieldGroup>
                      <Controller
                        name="email"
                        control={signInForm.control}
                        render={({ field, fieldState }) => (
                          <Field data-invalid={fieldState.invalid}>
                            <FieldLabel htmlFor="si-email">Email</FieldLabel>
                            <Input
                              {...field}
                              id="si-email"
                              type="email"
                              placeholder="you@example.com"
                              autoComplete="email"
                              aria-invalid={fieldState.invalid}
                            />
                            {fieldState.invalid && (
                              <FieldError errors={[fieldState.error]} />
                            )}
                          </Field>
                        )}
                      />
                      <Controller
                        name="password"
                        control={signInForm.control}
                        render={({ field, fieldState }) => (
                          <Field data-invalid={fieldState.invalid}>
                            <FieldLabel htmlFor="si-password">
                              Password
                            </FieldLabel>
                            <Input
                              {...field}
                              id="si-password"
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
                  <p className="text-sm text-center">
                    Don&apos;t have an account?{' '}
                    <span
                      className="text-primary cursor-pointer"
                      onClick={() => setEmailTab('signUp')}
                    >
                      Sign Up
                    </span>
                  </p>
                </div>
              </TabsContent>

              {/* Email sign-up */}
              <TabsContent value="signUp">
                <div className="flex flex-col gap-6">
                  <div>
                    <CardTitle className="text-center mb-1">Sign Up</CardTitle>
                    <CardDescription className="text-center">
                      Create a new account to get started.
                    </CardDescription>
                  </div>
                  <form
                    onSubmit={handleSignUp}
                    className="flex flex-col gap-5"
                  >
                    <FieldGroup>
                      <div className="flex gap-3">
                        <Controller
                          name="firstName"
                          control={signUpForm.control}
                          render={({ field, fieldState }) => (
                            <Field data-invalid={fieldState.invalid}>
                              <FieldLabel htmlFor="su-first">
                                First Name
                              </FieldLabel>
                              <Input
                                {...field}
                                id="su-first"
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
                              <FieldLabel htmlFor="su-last">
                                Last Name
                              </FieldLabel>
                              <Input
                                {...field}
                                id="su-last"
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
                            <FieldLabel htmlFor="su-email">Email</FieldLabel>
                            <Input
                              {...field}
                              id="su-email"
                              type="email"
                              placeholder="you@example.com"
                              autoComplete="email"
                              aria-invalid={fieldState.invalid}
                            />
                            {fieldState.invalid && (
                              <FieldError errors={[fieldState.error]} />
                            )}
                          </Field>
                        )}
                      />
                      <Controller
                        name="password"
                        control={signUpForm.control}
                        render={({ field, fieldState }) => (
                          <Field data-invalid={fieldState.invalid}>
                            <FieldLabel htmlFor="su-password">
                              Password
                            </FieldLabel>
                            <Input
                              {...field}
                              id="su-password"
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
                  <p className="text-sm text-center">
                    Already have an account?{' '}
                    <span
                      className="text-primary cursor-pointer"
                      onClick={() => setEmailTab('signIn')}
                    >
                      Sign In
                    </span>
                  </p>
                </div>
              </TabsContent>
            </Tabs>
          )}

          {/* ── Phone flows ───────────────────────────────────────────── */}
          {authMethod === 'phone' && (
            <Tabs
              value={phoneTab}
              className="flex flex-col gap-0"
            >
              {/* Phone sign-in */}
              <TabsContent value="signIn">
                <div className="flex flex-col gap-6">
                  <div>
                    <CardTitle className="text-center mb-1">Sign In</CardTitle>
                    <CardDescription className="text-center">
                      Enter your phone number and password.
                    </CardDescription>
                  </div>
                  <form
                    onSubmit={handlePhoneSignIn}
                    className="flex flex-col gap-5"
                  >
                    <FieldGroup>
                      <Controller
                        name="phone"
                        control={phoneSignInForm.control}
                        render={({ field, fieldState }) => (
                          <Field data-invalid={fieldState.invalid}>
                            <FieldLabel htmlFor="psi-phone">
                              Phone Number
                            </FieldLabel>
                            <Input
                              {...field}
                              id="psi-phone"
                              type="tel"
                              placeholder="+27 82 123 4567"
                              autoComplete="tel"
                              aria-invalid={fieldState.invalid}
                            />
                            {fieldState.invalid && (
                              <FieldError errors={[fieldState.error]} />
                            )}
                          </Field>
                        )}
                      />
                      <Controller
                        name="password"
                        control={phoneSignInForm.control}
                        render={({ field, fieldState }) => (
                          <Field data-invalid={fieldState.invalid}>
                            <FieldLabel htmlFor="psi-password">
                              Password
                            </FieldLabel>
                            <Input
                              {...field}
                              id="psi-password"
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
                  <p className="text-sm text-center">
                    Don&apos;t have an account?{' '}
                    <span
                      className="text-primary cursor-pointer"
                      onClick={() => setPhoneTab('signUp')}
                    >
                      Sign Up
                    </span>
                  </p>
                </div>
              </TabsContent>

              {/* Phone sign-up */}
              <TabsContent value="signUp">
                <div className="flex flex-col gap-6">
                  <div>
                    <CardTitle className="text-center mb-1">Sign Up</CardTitle>
                    <CardDescription className="text-center">
                      Create an account with your phone number.
                    </CardDescription>
                  </div>
                  <form
                    onSubmit={handlePhoneSignUp}
                    className="flex flex-col gap-5"
                  >
                    <FieldGroup>
                      <div className="flex gap-3">
                        <Controller
                          name="firstName"
                          control={phoneSignUpForm.control}
                          render={({ field, fieldState }) => (
                            <Field data-invalid={fieldState.invalid}>
                              <FieldLabel htmlFor="psu-first">
                                First Name
                              </FieldLabel>
                              <Input
                                {...field}
                                id="psu-first"
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
                          control={phoneSignUpForm.control}
                          render={({ field, fieldState }) => (
                            <Field data-invalid={fieldState.invalid}>
                              <FieldLabel htmlFor="psu-last">
                                Last Name
                              </FieldLabel>
                              <Input
                                {...field}
                                id="psu-last"
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
                        name="phone"
                        control={phoneSignUpForm.control}
                        render={({ field, fieldState }) => (
                          <Field data-invalid={fieldState.invalid}>
                            <FieldLabel htmlFor="psu-phone">
                              Phone Number
                            </FieldLabel>
                            <Input
                              {...field}
                              id="psu-phone"
                              type="tel"
                              placeholder="+27 82 123 4567"
                              autoComplete="tel"
                              aria-invalid={fieldState.invalid}
                            />
                            {fieldState.invalid && (
                              <FieldError errors={[fieldState.error]} />
                            )}
                          </Field>
                        )}
                      />
                      <Controller
                        name="password"
                        control={phoneSignUpForm.control}
                        render={({ field, fieldState }) => (
                          <Field data-invalid={fieldState.invalid}>
                            <FieldLabel htmlFor="psu-password">
                              Password
                            </FieldLabel>
                            <Input
                              {...field}
                              id="psu-password"
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
                  <p className="text-sm text-center">
                    Already have an account?{' '}
                    <span
                      className="text-primary cursor-pointer"
                      onClick={() => setPhoneTab('signIn')}
                    >
                      Sign In
                    </span>
                  </p>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
