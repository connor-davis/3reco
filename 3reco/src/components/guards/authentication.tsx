import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { format } from 'date-fns';
import { useConvexQuery } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import {
  ArrowRightIcon,
  CreditCardIcon,
  MailIcon,
  RotateCcwIcon,
  SearchIcon,
  ShieldCheckIcon,
  WeightIcon,
} from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { getEffectiveTransactionDate } from '@/lib/transactions';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

type AuthMode = 'sign-in' | 'sign-up' | 'forgot-password' | 'reset-password';

function CollectorLookupPanel({
  mode,
}: {
  mode: 'desktop' | 'mobile';
}) {
  const [collectorPhone, setCollectorPhone] = useState('');
  const [submittedPhone, setSubmittedPhone] = useState<string | null>(null);
  const collectorStats = useConvexQuery(
    api.collectors.statsByPhone,
    submittedPhone ? { phone: submittedPhone } : 'skip'
  );

  return (
    <div
      className={
        mode === 'desktop'
          ? 'flex h-full flex-col rounded-xl border bg-card p-6 shadow-[var(--shadow-glass)]'
          : 'flex flex-col gap-4'
      }
    >
      <div className="flex flex-col gap-2">
        <Label className="text-lg font-semibold">Collector lookup</Label>
        <p className="text-sm text-muted-foreground">
          Enter a collector phone number to view stats without signing in.
        </p>
      </div>

      <div className="mt-2 flex flex-col gap-3 sm:flex-row">
        <Input
          value={collectorPhone}
          onChange={(event) => setCollectorPhone(event.target.value)}
          placeholder="Collector phone number"
        />
        <Button
          variant="outline"
          onClick={() => setSubmittedPhone(collectorPhone.trim())}
          disabled={collectorPhone.trim().length === 0}
        >
          <SearchIcon />
          <Label>Check stats</Label>
        </Button>
      </div>

      {submittedPhone && collectorStats === undefined && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="text-primary" />
          <span>Looking up collector...</span>
        </div>
      )}

      {submittedPhone && collectorStats === null && (
        <div className="rounded-xl border border-dashed bg-muted/20 p-6 text-sm text-muted-foreground">
          Collector not found.
        </div>
      )}

      {!submittedPhone && mode === 'desktop' && (
        <div className="mt-6 grid flex-1 place-items-center rounded-xl border border-dashed bg-muted/20 p-8 text-center">
          <div className="max-w-md space-y-3">
            <Label className="text-xl">Quick collector overview</Label>
            <p className="text-sm leading-6 text-muted-foreground">
              Use a phone number to view collector totals, latest sales, and carbon
              savings without requiring a sign-in.
            </p>
          </div>
        </div>
      )}

      {collectorStats && (
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Label className="text-base">{collectorStats.collector.name}</Label>
            <p className="text-sm text-muted-foreground">
              {collectorStats.collector.phone}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border bg-background p-3 shadow-[var(--shadow-soft)]">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CreditCardIcon className="size-4" />
                Revenue
              </div>
              <p className="mt-2 text-lg font-semibold">
                R {collectorStats.totals.totalRevenue.toFixed(2)}
              </p>
            </div>
            <div className="rounded-xl border bg-background p-3 shadow-[var(--shadow-soft)]">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <WeightIcon className="size-4" />
                Volume
              </div>
              <p className="mt-2 text-lg font-semibold">
                {collectorStats.totals.totalVolume.toFixed(1)} kg
              </p>
            </div>
            <div className="rounded-xl border bg-background p-3 shadow-[var(--shadow-soft)]">
              <div className="text-sm text-muted-foreground">Transactions</div>
              <p className="mt-2 text-lg font-semibold">
                {collectorStats.totals.transactionCount}
              </p>
            </div>
          </div>

          <div className="rounded-xl border bg-background p-3 shadow-[var(--shadow-soft)]">
            <div className="flex items-center justify-between gap-3">
              <Label>Latest sales</Label>
              <span className="text-xs text-muted-foreground">
                Carbon savings: {collectorStats.carbonSavings.toFixed(1)} kg
              </span>
            </div>
            {collectorStats.latestTransactions.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No sales yet.</p>
            ) : (
              <div className="mt-3 flex flex-col gap-2">
                {collectorStats.latestTransactions.map((transaction) => (
                  <div
                    key={transaction._id}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {transaction.materialName}
                      </p>
                      <p className="truncate text-muted-foreground">
                        {transaction.buyerName}
                      </p>
                    </div>
                    <div className="text-right">
                      <p>R {transaction.price.toFixed(2)}</p>
                      <p className="text-muted-foreground">
                        {format(
                          new Date(getEffectiveTransactionDate(transaction)),
                          'dd/MM/yyyy'
                        )}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function getCurrentReturnTo() {
  if (window.location.pathname.startsWith('/auth/')) {
    return '/';
  }

  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function absoluteUrl(pathname: string) {
  return new URL(pathname, window.location.origin).toString();
}

export default function AuthenticationGuard() {
  const search = useSearch({ strict: false });
  const searchParams = search as Record<string, unknown>;
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  const [signUpName, setSignUpName] = useState('');
  const [signUpEmail, setSignUpEmail] = useState('');
  const [signUpPassword, setSignUpPassword] = useState('');
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const [resetPassword, setResetPassword] = useState('');

  const resetToken = useMemo(() => {
    return typeof searchParams.token === 'string' && searchParams.token.length > 0
      ? searchParams.token
      : null;
  }, [searchParams]);

  const resetLinkError = useMemo(() => {
    return typeof searchParams.error === 'string' && searchParams.error.length > 0
      ? searchParams.error
      : null;
  }, [searchParams]);

  const signInMutation = useMutation({
    mutationFn: async () => {
      await authClient.signIn.email({
        email: signInEmail,
        password: signInPassword,
        callbackURL: getCurrentReturnTo(),
      });
    },
    onSuccess: () => {
      setErrorMessage(null);
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Sign in failed.');
    },
  });

  const signUpMutation = useMutation({
    mutationFn: async () => {
      await authClient.signUp.email({
        name: signUpName,
        email: signUpEmail,
        password: signUpPassword,
        callbackURL: getCurrentReturnTo(),
      });
    },
    onSuccess: () => {
      setErrorMessage(null);
      setSuccessMessage(
        'Account created. Please verify your email before signing in.'
      );
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Sign up failed.');
    },
  });

  const forgotPasswordMutation = useMutation({
    mutationFn: async () => {
      await authClient.requestPasswordReset({
        email: forgotPasswordEmail,
        redirectTo: absoluteUrl('/auth/reset-password'),
      });
    },
    onSuccess: () => {
      setErrorMessage(null);
      setSuccessMessage(
        'If the account exists, a reset link has been sent to that email address.'
      );
    },
    onError: (error) => {
      setErrorMessage(
        error instanceof Error ? error.message : 'Could not request a reset link.'
      );
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async () => {
      if (!resetToken) {
        throw new Error('Missing reset token.');
      }

      await authClient.resetPassword({
        newPassword: resetPassword,
        token: resetToken,
      });
    },
    onSuccess: () => {
      setErrorMessage(null);
      setSuccessMessage('Password updated. You can now sign in.');
      setMode('sign-in');
      setResetPassword('');
      window.history.replaceState({}, '', '/');
    },
    onError: (error) => {
      setErrorMessage(
        error instanceof Error ? error.message : 'Could not reset password.'
      );
    },
  });

  const resendVerificationMutation = useMutation({
    mutationFn: async () => {
      const email = signUpEmail || signInEmail;

      if (!email) {
        throw new Error('Enter an email address first.');
      }

      await authClient.sendVerificationEmail({
        email,
        callbackURL: getCurrentReturnTo(),
      });
    },
    onSuccess: () => {
      setErrorMessage(null);
      setSuccessMessage('Verification email sent. Please check your inbox.');
    },
    onError: (error) => {
      setErrorMessage(
        error instanceof Error ? error.message : 'Could not resend verification email.'
      );
    },
  });

  const isBusy =
    signInMutation.isPending ||
    signUpMutation.isPending ||
    forgotPasswordMutation.isPending ||
    resetPasswordMutation.isPending ||
    resendVerificationMutation.isPending;

  return (
    <div className="flex h-full w-full items-center justify-center bg-transparent p-4 sm:p-6">
      <div className="grid h-full w-full max-w-7xl gap-4 lg:grid-cols-[420px_minmax(0,1fr)]">
        <Card className="flex h-full max-w-full flex-col gap-8 lg:rounded-xl">
          <CardHeader className="items-center text-center">
            <div className="flex size-12 items-center justify-center rounded-xl border bg-primary/10 text-primary shadow-[var(--shadow-soft)]">
              <ShieldCheckIcon className="size-6" />
            </div>
            <CardTitle>Sign in with Better Auth</CardTitle>
            <CardDescription>
              Use email and password, recover access with reset links, and verify
              your email securely.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-4">
            {resetLinkError && (
              <Alert variant="destructive">
                <AlertTitle>Reset link issue</AlertTitle>
                <AlertDescription>
                  This reset link is invalid or expired. Request a fresh one below.
                </AlertDescription>
              </Alert>
            )}

            {errorMessage && (
              <Alert variant="destructive">
                <AlertTitle>Authentication error</AlertTitle>
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}

            {successMessage && (
              <Alert>
                <AlertTitle>Success</AlertTitle>
                <AlertDescription>{successMessage}</AlertDescription>
              </Alert>
            )}

            <Tabs
              value={mode}
              onValueChange={(value) => {
                setErrorMessage(null);
                setSuccessMessage(null);
                setMode(value as AuthMode);
              }}
              className="w-full"
            >
              <TabsList className="w-full">
                <TabsTrigger value="sign-in">Sign in</TabsTrigger>
                <TabsTrigger value="sign-up">Create account</TabsTrigger>
                <TabsTrigger value="forgot-password">Forgot password</TabsTrigger>
                <TabsTrigger value="reset-password" disabled={!resetToken}>
                  Reset password
                </TabsTrigger>
              </TabsList>

              <TabsContent value="sign-in" className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="sign-in-email">Email</Label>
                  <Input
                    id="sign-in-email"
                    type="email"
                    value={signInEmail}
                    onChange={(event) => setSignInEmail(event.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sign-in-password">Password</Label>
                  <Input
                    id="sign-in-password"
                    type="password"
                    value={signInPassword}
                    onChange={(event) => setSignInPassword(event.target.value)}
                    placeholder="Enter your password"
                  />
                </div>
                <Button
                  className="w-full"
                  disabled={isBusy}
                  onClick={() => signInMutation.mutate()}
                >
                  {signInMutation.isPending ? (
                    <Spinner className="text-current" />
                  ) : (
                    <ArrowRightIcon />
                  )}
                  <Label>Continue to sign in</Label>
                </Button>
              </TabsContent>

              <TabsContent value="sign-up" className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="sign-up-name">Full name</Label>
                  <Input
                    id="sign-up-name"
                    value={signUpName}
                    onChange={(event) => setSignUpName(event.target.value)}
                    placeholder="Your full name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sign-up-email">Email</Label>
                  <Input
                    id="sign-up-email"
                    type="email"
                    value={signUpEmail}
                    onChange={(event) => setSignUpEmail(event.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sign-up-password">Password</Label>
                  <Input
                    id="sign-up-password"
                    type="password"
                    value={signUpPassword}
                    onChange={(event) => setSignUpPassword(event.target.value)}
                    placeholder="Choose a strong password"
                  />
                </div>
                <Button
                  className="w-full"
                  disabled={isBusy}
                  onClick={() => signUpMutation.mutate()}
                >
                  {signUpMutation.isPending ? (
                    <Spinner className="text-current" />
                  ) : (
                    <MailIcon />
                  )}
                  <Label>Create account</Label>
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={isBusy || (signUpEmail || signInEmail).trim().length === 0}
                  onClick={() => resendVerificationMutation.mutate()}
                >
                  {resendVerificationMutation.isPending ? (
                    <Spinner className="text-current" />
                  ) : (
                    <RotateCcwIcon />
                  )}
                  <Label>Resend verification email</Label>
                </Button>
              </TabsContent>

              <TabsContent value="forgot-password" className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="forgot-password-email">Email</Label>
                  <Input
                    id="forgot-password-email"
                    type="email"
                    value={forgotPasswordEmail}
                    onChange={(event) => setForgotPasswordEmail(event.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
                <Button
                  className="w-full"
                  disabled={isBusy || forgotPasswordEmail.trim().length === 0}
                  onClick={() => forgotPasswordMutation.mutate()}
                >
                  {forgotPasswordMutation.isPending ? (
                    <Spinner className="text-current" />
                  ) : (
                    <RotateCcwIcon />
                  )}
                  <Label>Send reset link</Label>
                </Button>
              </TabsContent>

              <TabsContent value="reset-password" className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-password-input">New password</Label>
                  <Input
                    id="reset-password-input"
                    type="password"
                    value={resetPassword}
                    onChange={(event) => setResetPassword(event.target.value)}
                    placeholder="Choose a new password"
                  />
                </div>
                <Button
                  className="w-full"
                  disabled={isBusy || !resetToken || resetPassword.trim().length < 8}
                  onClick={() => resetPasswordMutation.mutate()}
                >
                  {resetPasswordMutation.isPending ? (
                    <Spinner className="text-current" />
                  ) : (
                    <ArrowRightIcon />
                  )}
                  <Label>Update password</Label>
                </Button>
              </TabsContent>
            </Tabs>

            <div className="mt-auto flex flex-col gap-3 lg:hidden">
              <Drawer>
                <DrawerTrigger asChild>
                  <Button variant="outline" className="w-full">
                    <SearchIcon />
                    <Label>Open collector lookup</Label>
                  </Button>
                </DrawerTrigger>
                <DrawerContent>
                  <DrawerHeader>
                    <DrawerTitle>Collector lookup</DrawerTitle>
                    <DrawerDescription>
                      Check collector performance without signing in.
                    </DrawerDescription>
                  </DrawerHeader>
                  <div className="px-4 pb-4">
                    <CollectorLookupPanel mode="mobile" />
                  </div>
                </DrawerContent>
              </Drawer>
            </div>
          </CardContent>
        </Card>

        <div className="hidden h-full min-h-0 lg:block">
          <CollectorLookupPanel mode="desktop" />
        </div>
      </div>
    </div>
  );
}
