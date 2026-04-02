import { type ReactNode, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Link,
  Navigate,
  useNavigate,
  useSearch,
} from '@tanstack/react-router';
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
import { useConvexAuth } from 'convex/react';
import { authClient } from '@/lib/auth-client';
import { getEffectiveTransactionDate } from '@/lib/transactions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
          ? 'flex h-full flex-col rounded-xl border bg-card p-6 shadow-[var(--shadow-soft)]'
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
          <span>Check stats</span>
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

function absoluteUrl(pathname: string) {
  return new URL(pathname, window.location.origin).toString();
}

function AuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-transparent p-4 sm:p-6">
      <div className="grid h-full w-full max-w-7xl gap-4 lg:grid-cols-[420px_minmax(0,1fr)]">
        <Card className="flex h-full max-w-full flex-col gap-8 lg:rounded-xl">
          <CardHeader className="items-center text-center">
            <div className="flex size-12 items-center justify-center rounded-xl border bg-primary/10 text-primary shadow-[var(--shadow-soft)]">
              <ShieldCheckIcon className="size-6" />
            </div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-4">
            {children}

            <div className="mt-auto flex flex-col gap-3 lg:hidden">
              <Drawer>
                <DrawerTrigger asChild>
                  <Button variant="outline" className="w-full">
                    <SearchIcon />
                    <span>Open collector lookup</span>
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

function AuthStatus({
  errorMessage,
  successMessage,
  resetLinkError,
}: {
  errorMessage?: string | null;
  successMessage?: string | null;
  resetLinkError?: string | null;
}) {
  return (
    <>
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
    </>
  );
}

function useAuthRouteRedirect() {
  const { isAuthenticated } = useConvexAuth();

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return null;
}

function AuthLinks({
  primaryPrompt,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
}: {
  primaryPrompt: string;
  primaryHref: '/auth/sign-in' | '/auth/sign-up' | '/auth/forgot-password' | '/';
  primaryLabel: string;
  secondaryHref?: '/auth/sign-in' | '/auth/sign-up' | '/auth/forgot-password' | '/';
  secondaryLabel?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 pt-2 text-center text-sm text-muted-foreground">
      <p>
        {primaryPrompt}{' '}
        <Link to={primaryHref} className="text-foreground underline underline-offset-4">
          {primaryLabel}
        </Link>
      </p>
      {secondaryHref && secondaryLabel ? (
        <Link
          to={secondaryHref}
          className="text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
        >
          {secondaryLabel}
        </Link>
      ) : null}
    </div>
  );
}

export default function AuthenticationGuard() {
  return (
    <AuthShell
      title="Welcome to 3rEco"
      description="Please sign in to continue."
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link to="/auth/sign-in" className="flex-1">
            <Button className="w-full">
              <ArrowRightIcon />
              <span>Continue to app</span>
            </Button>
          </Link>
          <Link to="/auth/sign-up" className="flex-1">
            <Button variant="outline" className="w-full">
              <MailIcon />
              <span>Create account</span>
            </Button>
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}

export function SignInPage() {
  const redirect = useAuthRouteRedirect();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const signInMutation = useMutation({
    mutationFn: async () => {
      await authClient.signIn.email({
        email,
        password,
        callbackURL: '/',
      });
    },
    onSuccess: () => {
      setErrorMessage(null);
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Sign in failed.');
    },
  });

  if (redirect) {
    return redirect;
  }

  const isBusy = signInMutation.isPending;

  return (
    <AuthShell
      title="Welcome to 3rEco"
      description="Please sign in to continue."
    >
      <AuthStatus errorMessage={errorMessage} />

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="sign-in-email">Email</Label>
          <Input
            id="sign-in-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sign-in-password">Password</Label>
          <Input
            id="sign-in-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter your password"
          />
        </div>
        <Button
          className="w-full"
          disabled={isBusy || email.trim().length === 0 || password.length === 0}
          onClick={() => signInMutation.mutate()}
        >
          {signInMutation.isPending ? (
            <Spinner className="text-current" />
          ) : (
            <ArrowRightIcon />
          )}
          <span>Sign in</span>
        </Button>
      </div>

      <AuthLinks
        primaryPrompt="Don't have an account?"
        primaryHref="/auth/sign-up"
        primaryLabel="Create one"
        secondaryHref="/auth/forgot-password"
        secondaryLabel="Forgot your password?"
      />
    </AuthShell>
  );
}

export function SignUpPage() {
  const redirect = useAuthRouteRedirect();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const signUpMutation = useMutation({
    mutationFn: async () => {
      await authClient.signUp.email({
        name,
        email,
        password,
        callbackURL: '/',
      });
    },
    onSuccess: () => {
      setErrorMessage(null);
      setSuccessMessage(null);
      void navigate({
        to: '/auth/verify-email',
        search: { email },
      });
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Sign up failed.');
    },
  });

  if (redirect) {
    return redirect;
  }

  const isBusy = signUpMutation.isPending;

  return (
    <AuthShell
      title="Welcome to 3rEco"
      description="Create your account."
    >
      <AuthStatus errorMessage={errorMessage} successMessage={successMessage} />

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="sign-up-name">Full name</Label>
          <Input
            id="sign-up-name"
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Your full name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sign-up-email">Email</Label>
          <Input
            id="sign-up-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sign-up-password">Password</Label>
          <Input
            id="sign-up-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Choose a strong password"
          />
        </div>
        <Button
          className="w-full"
          disabled={
            isBusy ||
            name.trim().length === 0 ||
            email.trim().length === 0 ||
            password.length === 0
          }
          onClick={() => signUpMutation.mutate()}
        >
          {signUpMutation.isPending ? (
            <Spinner className="text-current" />
          ) : (
            <MailIcon />
          )}
          <span>Create account</span>
        </Button>
      </div>

      <AuthLinks
        primaryPrompt="Already have an account?"
        primaryHref="/auth/sign-in"
        primaryLabel="Sign in"
        secondaryHref="/"
        secondaryLabel="Back to welcome"
      />
    </AuthShell>
  );
}

export function VerifyEmailPage() {
  const redirect = useAuthRouteRedirect();
  const search = useSearch({ strict: false });
  const searchParams = search as Record<string, unknown>;
  const email =
    typeof searchParams.email === 'string' && searchParams.email.length > 0
      ? searchParams.email
      : null;
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const resendVerificationMutation = useMutation({
    mutationFn: async () => {
      if (!email) {
        throw new Error('Missing email address.');
      }

      await authClient.sendVerificationEmail({
        email,
        callbackURL: '/',
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

  if (redirect) {
    return redirect;
  }

  return (
    <AuthShell
      title="Welcome to 3rEco"
      description="Check your email to verify your account."
    >
      <AuthStatus errorMessage={errorMessage} successMessage={successMessage} />

      <div className="space-y-4">
        <p className="text-sm leading-6 text-muted-foreground">
          We sent a verification email
          {email ? (
            <>
              {' '}
              to <strong className="text-foreground">{email}</strong>
            </>
          ) : null}
          . Open your mailbox and click the verification link to continue.
        </p>

        <Button
          variant="outline"
          className="w-full"
          disabled={resendVerificationMutation.isPending || !email}
          onClick={() => resendVerificationMutation.mutate()}
        >
          {resendVerificationMutation.isPending ? (
            <Spinner className="text-current" />
          ) : (
            <RotateCcwIcon />
          )}
          <span>Resend verification email</span>
        </Button>
      </div>

      <AuthLinks
        primaryPrompt="Already verified?"
        primaryHref="/auth/sign-in"
        primaryLabel="Back to sign in"
        secondaryHref="/"
        secondaryLabel="Back to welcome"
      />
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  const redirect = useAuthRouteRedirect();
  const [email, setEmail] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const forgotPasswordMutation = useMutation({
    mutationFn: async () => {
      await authClient.requestPasswordReset({
        email,
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

  if (redirect) {
    return redirect;
  }

  return (
    <AuthShell
      title="Welcome to 3rEco"
      description="Reset your password."
    >
      <AuthStatus errorMessage={errorMessage} successMessage={successMessage} />

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="forgot-password-email">Email</Label>
          <Input
            id="forgot-password-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <Button
          className="w-full"
          disabled={forgotPasswordMutation.isPending || email.trim().length === 0}
          onClick={() => forgotPasswordMutation.mutate()}
        >
          {forgotPasswordMutation.isPending ? (
            <Spinner className="text-current" />
          ) : (
            <RotateCcwIcon />
          )}
          <span>Send reset link</span>
        </Button>
      </div>

      <AuthLinks
        primaryPrompt="Remembered your password?"
        primaryHref="/auth/sign-in"
        primaryLabel="Back to sign in"
        secondaryHref="/auth/sign-up"
        secondaryLabel="Need an account instead?"
      />
    </AuthShell>
  );
}

export function ResetPasswordPage() {
  const redirect = useAuthRouteRedirect();
  const search = useSearch({ strict: false });
  const searchParams = search as Record<string, unknown>;
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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

  const resetPasswordMutation = useMutation({
    mutationFn: async () => {
      if (!resetToken) {
        throw new Error('Missing reset token.');
      }

      await authClient.resetPassword({
        newPassword: password,
        token: resetToken,
      });
    },
    onSuccess: () => {
      setErrorMessage(null);
      setSuccessMessage('Password updated. You can now sign in.');
      setPassword('');
      window.history.replaceState({}, '', '/auth/reset-password');
    },
    onError: (error) => {
      setErrorMessage(
        error instanceof Error ? error.message : 'Could not reset password.'
      );
    },
  });

  if (redirect) {
    return redirect;
  }

  return (
    <AuthShell
      title="Welcome to 3rEco"
      description="Choose a new password."
    >
      <AuthStatus
        errorMessage={errorMessage}
        successMessage={successMessage}
        resetLinkError={resetLinkError}
      />

      {!resetToken && !resetLinkError && !successMessage ? (
        <Alert variant="destructive">
          <AlertTitle>Missing reset link</AlertTitle>
          <AlertDescription>
            Open the reset link from your email, or request a fresh one below.
          </AlertDescription>
        </Alert>
      ) : null}

      {!successMessage ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reset-password-input">New password</Label>
            <Input
              id="reset-password-input"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Choose a new password"
            />
          </div>
          <Button
            className="w-full"
            disabled={
              resetPasswordMutation.isPending ||
              !resetToken ||
              password.trim().length < 8
            }
            onClick={() => resetPasswordMutation.mutate()}
          >
            {resetPasswordMutation.isPending ? (
              <Spinner className="text-current" />
            ) : (
              <ArrowRightIcon />
            )}
            <span>Update password</span>
          </Button>
        </div>
      ) : (
        <Link to="/auth/sign-in">
          <Button className="w-full">
            <ArrowRightIcon />
            <span>Go to sign in</span>
          </Button>
        </Link>
      )}

      <AuthLinks
        primaryPrompt="Need another reset email?"
        primaryHref="/auth/forgot-password"
        primaryLabel="Request a new link"
        secondaryHref="/auth/sign-in"
        secondaryLabel="Back to sign in"
      />
    </AuthShell>
  );
}
