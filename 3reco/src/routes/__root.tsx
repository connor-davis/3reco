import AuthenticationGuard from '@/components/guards/authentication';
import CompleteProfileGuard from '@/components/guards/completeProfile';
import Header from '@/components/header';
import AppSidebar from '@/components/sidebar/app-sidebar';
import { Label } from '@/components/ui/label';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/sonner';
import { Spinner } from '@/components/ui/spinner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { convexQuery, useConvexMutation } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import { useQuery } from '@tanstack/react-query';
import { createRootRoute, Outlet } from '@tanstack/react-router';
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useConvexAuth,
} from 'convex/react';
import { Activity, useEffect, useState } from 'react';

const RootLayout = () => {
  const { isAuthenticated } = useConvexAuth();
  const syncCurrentUserFromAuth = useConvexMutation(
    api.users.syncCurrentUserFromAuth
  );
  const [isProvisioningUser, setIsProvisioningUser] = useState(false);
  const { data: user, isLoading: isLoadingUser } = useQuery({
    ...convexQuery(api.users.currentUserOrNull),
    enabled: isAuthenticated,
    retry: false,
  });

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (!isAuthenticated || isLoadingUser || user || isProvisioningUser) {
        return;
      }

      setIsProvisioningUser(true);
      void syncCurrentUserFromAuth({}).finally(() => {
        setIsProvisioningUser(false);
      });
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    isAuthenticated,
    isLoadingUser,
    isProvisioningUser,
    syncCurrentUserFromAuth,
    user,
  ]);

  if (isLoadingUser || (isAuthenticated && (isProvisioningUser || !user)))
    return (
      <div className="flex min-h-dvh w-full flex-col items-center justify-center gap-3 bg-background text-foreground">
        <div className="flex items-center gap-3">
          <Spinner className="text-primary" />
              <Label className="text-muted-foreground">
            {isProvisioningUser
              ? 'Setting up your account...'
              : 'Getting your profile ready...'}
          </Label>
        </div>
      </div>
    );

  return (
    <TooltipProvider>
      <AuthLoading>
        <div className="flex flex-col w-full h-full items-center justify-center gap-3">
          <div className="flex items-center gap-3">
            <Spinner className="text-primary" />
            <Label className="text-muted-foreground">
              Signing you in...
            </Label>
          </div>
        </div>
      </AuthLoading>

      <Authenticated>
        <Activity
          mode={
            !isLoadingUser && user && !user.profileComplete
              ? 'visible'
              : 'hidden'
          }
        >
          <div className="flex min-h-dvh w-full flex-col overflow-hidden bg-background text-foreground">
            <CompleteProfileGuard />
          </div>
        </Activity>
        <Activity
          mode={
            !isLoadingUser && user && user.profileComplete
              ? 'visible'
              : 'hidden'
          }
        >
          <div className="flex min-h-dvh w-full flex-col bg-background text-foreground">
            <SidebarProvider>
              <AppSidebar />

              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <Header />

                <SidebarInset className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-transparent p-2 sm:p-3">
                  <div className="flex h-full w-full min-w-0 flex-col gap-3 overflow-hidden rounded-xl bg-background p-2 sm:p-3">
                    <Outlet />
                  </div>
                </SidebarInset>
              </div>
            </SidebarProvider>
          </div>
        </Activity>
      </Authenticated>

      <Unauthenticated>
        <div className="flex min-h-dvh w-full flex-col bg-background text-foreground">
          <AuthenticationGuard />
        </div>
      </Unauthenticated>

      {/*<TanStackRouterDevtools position="top-left" />*/}

      <Toaster />
    </TooltipProvider>
  );
};

export const Route = createRootRoute({
  component: RootLayout,
  beforeLoad: () => {},
});
