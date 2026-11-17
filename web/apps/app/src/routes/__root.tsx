import { createRootRoute, Outlet } from '@tanstack/react-router';
import { DemoBanner } from '@/components/demo-banner';
import { SetupGate } from '@/components/setup-gate';
import { AppShell } from '@/components/shell/app-shell';
import { NotFound } from '@/components/not-found';

export const Route = createRootRoute({
  notFoundComponent: NotFound,
  component: () => (
    <>
      <DemoBanner />
      <AppShell>
        <SetupGate>
          <Outlet />
        </SetupGate>
      </AppShell>
    </>
  ),
});
