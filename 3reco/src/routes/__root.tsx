import AuthenticationGuard from '@/components/guards/authentication';
import CompleteProfileGuard from '@/components/guards/completeProfile';
import Header from '@/components/header';
import AppSidebar from '@/components/sidebar/app-sidebar';
import { Label } from '@/components/ui/label';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/sonner';
import { Spinner } from '@/components/ui/spinner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { convexQuery } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import { useQuery } from '@tanstack/react-query';
import { createRootRoute, Outlet } from '@tanstack/react-router';
import { useWorkOSAuth } from '@/components/providers/workos-auth';
import { Activity } from 'react';

const RootLayout = () => {
  const { isAuthenticated, isLoading: isAuthLoading } = useWorkOSAuth();
  const { data: user, isLoading: isLoadingUser } = useQuery({
    ...convexQuery(api.users.currentUser),
    enabled: isAuthenticated,
  });

  if (isAuthLoading || (isAuthenticated && isLoadingUser))
    return (
      <div className="flex flex-col w-screen h-screen items-center justify-center gap-3 bg-background text-foreground">
        <div className="flex items-center gap-3">
          <Spinner className="text-primary" />
          <Label className="text-muted-foreground">
            Loading...
          </Label>
        </div>
      </div>
    );

  return (
    <TooltipProvider>
      {isAuthenticated ? (
        <>
          <Activity
            mode={
              !isLoadingUser && user && !user.profileComplete
                ? 'visible'
                : 'hidden'
            }
          >
            <div className="flex flex-col w-screen h-screen text-foreground bg-background overflow-hidden">
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
            <div className="flex flex-col w-screen h-screen text-foreground bg-background">
              <SidebarProvider>
                <AppSidebar />

                <div className="flex flex-col w-full h-full overflow-hidden">
                  <Header />

                  <SidebarInset className="bg-transparent p-2 sm:pr-3 sm:pb-3 overflow-hidden">
                    <div className="flex flex-col w-full h-full p-2 sm:p-3 gap-3 bg-background rounded-xl overflow-hidden">
                      <Outlet />
                    </div>
                  </SidebarInset>
                </div>
              </SidebarProvider>
            </div>
          </Activity>
        </>
      ) : (
        <div className="flex flex-col w-screen h-screen text-foreground bg-background">
          <AuthenticationGuard />
        </div>
      )}

      {/*<TanStackRouterDevtools position="top-left" />*/}

      <Toaster />
    </TooltipProvider>
  );
};

export const Route = createRootRoute({
  component: RootLayout,
  beforeLoad: () => {},
});
