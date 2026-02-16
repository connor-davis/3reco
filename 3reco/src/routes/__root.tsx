import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { createRootRoute, Navigate, Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { Authenticated, Unauthenticated } from 'convex/react';

const RootLayout = () => {
  return (
    <TooltipProvider>
      <Authenticated>
        <Outlet />
      </Authenticated>

      <Unauthenticated>
        <Navigate to="/authentication" mask={{ to: '/' }} />
        <Outlet />
      </Unauthenticated>

      <TanStackRouterDevtools />

      <Toaster />
    </TooltipProvider>
  );
};

export const Route = createRootRoute({ component: RootLayout });
