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
import { useConvexQuery } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import { useMutation } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useAuth } from '@workos-inc/authkit-react';
import {
  ArrowRightIcon,
  CreditCardIcon,
  SearchIcon,
  ShieldCheckIcon,
  WeightIcon,
} from 'lucide-react';
import { useState } from 'react';
import { getEffectiveTransactionDate } from '@/lib/transactions';

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
          ? 'flex h-full flex-col rounded-3xl border bg-card/60 p-6 shadow-sm backdrop-blur-sm'
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
        <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
          Collector not found.
        </div>
      )}

      {!submittedPhone && mode === 'desktop' && (
        <div className="mt-6 grid flex-1 place-items-center rounded-2xl border border-dashed bg-muted/30 p-8 text-center">
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
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CreditCardIcon className="size-4" />
                Revenue
              </div>
              <p className="mt-2 text-lg font-semibold">
                R {collectorStats.totals.totalRevenue.toFixed(2)}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <WeightIcon className="size-4" />
                Volume
              </div>
              <p className="mt-2 text-lg font-semibold">
                {collectorStats.totals.totalVolume.toFixed(1)} kg
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-sm text-muted-foreground">Transactions</div>
              <p className="mt-2 text-lg font-semibold">
                {collectorStats.totals.transactionCount}
              </p>
            </div>
          </div>

          <div className="rounded-lg border p-3">
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

export default function AuthenticationGuard() {
  const { signIn, signUp, isLoading } = useAuth();
  const returnTo =
    window.location.pathname === '/callback'
      ? '/'
      : `${window.location.pathname}${window.location.search}${window.location.hash}`;

  const signInMutation = useMutation({
    mutationFn: async () => {
      await signIn({ state: { returnTo } });
    },
  });

  const signUpMutation = useMutation({
    mutationFn: async () => {
      await signUp({ state: { returnTo } });
    },
  });

  const isBusy = isLoading || signInMutation.isPending || signUpMutation.isPending;

  return (
    <div className="flex h-full w-full items-center justify-center bg-background p-4">
      <div className="grid h-full w-full max-w-7xl gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
        <Card className="flex h-full max-w-full flex-col gap-8 lg:rounded-3xl">
          <CardHeader className="items-center text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ShieldCheckIcon className="size-6" />
            </div>
            <CardTitle>Sign in with WorkOS</CardTitle>
            <CardDescription>
              Authentication now uses WorkOS for businesses, staff, and admins.
              Collectors can check their stats from the dedicated lookup panel.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-4">
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

            <Button
              variant="outline"
              className="w-full"
              disabled={isBusy}
              onClick={() => signUpMutation.mutate()}
            >
              {signUpMutation.isPending ? (
                <Spinner className="text-current" />
              ) : (
                <ArrowRightIcon />
              )}
              <Label>Create a business account</Label>
            </Button>

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
