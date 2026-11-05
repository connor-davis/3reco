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
import {
  Navigate,
  Outlet,
  createRootRoute,
  useLocation,
} from '@tanstack/react-router';
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useConvexAuth,
} from 'convex/react';
import { Activity, useEffect, useState } from 'react';

const RootLayout = () => {
  const { isAuthenticated } = useConvexAuth();
  const location = useLocation();
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
      <div className="flex min-h-dvh w-full flex-col items-center justify-center gap-3 bg-transparent text-foreground">
        <div className="flex items-center gap-3 rounded-lg border bg-card px-5 py-3 shadow-[var(--shadow-soft)]">
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
        <div className="flex h-screen w-screen flex-col items-center justify-center gap-3">
          <div className="flex items-center gap-3 rounded-2xl border bg-card px-5 py-3 shadow-[var(--shadow-soft)]">
            <Spinner className="text-primary" />
            <Label className="text-muted-foreground">
              Signing you in...
            </Label>
          </div>
        </div>
      </AuthLoading>

      <Authenticated>
        {location.pathname.startsWith('/auth/') ? (
          <div className="flex min-h-dvh w-full flex-col bg-background text-foreground">
            <Outlet />
          </div>
        ) : (
          <>
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
              <div className="flex min-h-dvh w-full flex-col bg-background text-foreground animate-in fade-in-1">
                <SidebarProvider>
                  <AppSidebar />

                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    <Header />

                    <SidebarInset className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-transparent">
                      <div className="flex h-full w-full min-w-0 flex-col overflow-hidden py-3 pr-3">
                        <Outlet />
                      </div>
                    </SidebarInset>
                  </div>
                </SidebarProvider>
              </div>
            </Activity>
          </>
        )}
      </Authenticated>

      <Unauthenticated>
        <div className="flex min-h-dvh w-full flex-col bg-background text-foreground">
          {location.pathname === '/' ? (
            <AuthenticationGuard />
          ) : location.pathname.startsWith('/auth/') ? (
            <Outlet />
          ) : (
            <Navigate to="/" replace />
          )}
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
