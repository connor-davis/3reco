import { createRootRoute, Outlet } from '@tanstack/react-router';
import { SetupGate } from '@/components/setup-gate';
import { AppShell } from '@/components/shell/app-shell';
import { NotFound } from '@/components/not-found';

export const Route = createRootRoute({
  notFoundComponent: NotFound,
  component: () => (
    <AppShell>
      <SetupGate>
        <Outlet />
      </SetupGate>
    </AppShell>
  ),
});
