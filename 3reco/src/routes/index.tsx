import AdminDashboard from '@/components/sections/dashboard/admin-dashboard';
import BackButton from '@/components/back-button';
import BusinessDashboard from '@/components/sections/dashboard/business-dashboard';
import CollectorDashboard from '@/components/sections/dashboard/collector-dashboard';
import PageHeaderDrawer from '@/components/page-header-drawer';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@convex/_generated/api';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from 'convex/react';
import { useState } from 'react';
import type { DateRange } from 'react-day-picker';

export const Route = createFileRoute('/')({
  component: Index,
});

function Index() {
  const user = useQuery(api.users.currentUser);
  const [dateRange, setDateRange] = useState<DateRange | undefined>();

  if (user === undefined) {
    return (
      <div className="flex flex-col w-full h-full gap-3 overflow-hidden">
        <div className="flex items-center w-full h-auto gap-3">
          <Skeleton className="h-6 w-32" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-full gap-3 overflow-hidden">
      <div className="flex items-center w-full h-auto gap-3">
        <div className="flex items-center gap-3">
          <BackButton />
          <Label className="text-lg">Dashboard</Label>
        </div>
        <div className="flex items-center gap-3 ml-auto">
          <PageHeaderDrawer
            title="Dashboard Filters"
            description="Filter dashboard data by date range"
          >
            <DateRangePicker value={dateRange} onChange={setDateRange} placeholder="All time" />
          </PageHeaderDrawer>
        </div>
      </div>

      <div className="flex flex-col w-full h-full overflow-y-auto gap-6">
        {(user?.type === 'admin' || user?.type === 'staff') && <AdminDashboard dateRange={dateRange} />}
        {user?.type === 'business' && <BusinessDashboard dateRange={dateRange} />}
        {user?.type === 'collector' && <CollectorDashboard dateRange={dateRange} />}
      </div>
    </div>
  );
}
