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
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useConvexAuth,
} from 'convex/react';
import { Activity } from 'react';

const RootLayout = () => {
  const { isAuthenticated } = useConvexAuth();
  const { data: user, isLoading: isLoadingUser } = useQuery({
    ...convexQuery(api.users.currentUser),
    enabled: isAuthenticated,
  });

  if (isLoadingUser)
    return (
      <div className="flex flex-col w-screen h-screen items-center justify-center gap-3 bg-background text-foreground">
        <div className="flex items-center gap-3">
          <Spinner className="text-primary" />
          <Label className="text-muted-foreground">
            Loading user profile...
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
              Loading authentication...
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
          <div className="flex flex-col w-screen h-screen text-foreground bg-background">
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

              <div className="flex flex-col w-full h-full">
                <Header />

                <SidebarInset className="bg-transparent pr-3 pb-3">
                  <div className="flex flex-col w-full h-full p-3 gap-3 bg-background rounded-xl">
                    <Outlet />
                  </div>
                </SidebarInset>
              </div>
            </SidebarProvider>
          </div>
        </Activity>
      </Authenticated>

      <Unauthenticated>
        <div className="flex flex-col w-screen h-screen text-foreground bg-background">
          <AuthenticationGuard />
        </div>
      </Unauthenticated>

      <TanStackRouterDevtools />

      <Toaster />
    </TooltipProvider>
  );
};

export const Route = createRootRoute({
  component: RootLayout,
  beforeLoad: () => {},
});
