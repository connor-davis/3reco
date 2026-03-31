import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@workos-inc/authkit-react';
import { ArrowRightIcon, ShieldCheckIcon } from 'lucide-react';

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
    <div className="flex flex-col w-full h-full items-center justify-center p-4 bg-background">
      <Card className="max-w-md w-full gap-8">
        <CardHeader className="items-center text-center">
          <div className="flex items-center justify-center size-12 rounded-full bg-primary/10 text-primary">
            <ShieldCheckIcon className="size-6" />
          </div>
          <CardTitle>Sign in with WorkOS</CardTitle>
          <CardDescription>
            Authentication now uses WorkOS. Continue to the hosted sign-in flow
            to access 3rEco.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
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
            <Label>Create an account</Label>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
