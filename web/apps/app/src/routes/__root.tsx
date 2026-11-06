import { createRootRoute, Outlet } from '@tanstack/react-router';
import { SetupGate } from '@/components/setup-gate';
import { AppShell } from '@/components/shell/app-shell';

export const Route = createRootRoute({
  component: () => (
    <AppShell>
      <SetupGate>
        <Outlet />
      </SetupGate>
    </AppShell>
  ),
});
