import AdminDashboard from '@/components/sections/dashboard/admin-dashboard';
import BusinessDashboard from '@/components/sections/dashboard/business-dashboard';
import CollectorDashboard from '@/components/sections/dashboard/collector-dashboard';
import { api } from '@convex/_generated/api';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from 'convex/react';
import { Skeleton } from '@/components/ui/skeleton';

export const Route = createFileRoute('/')({
  component: Index,
});

function Index() {
  const user = useQuery(api.users.currentUser);

  if (user === undefined) {
    return (
      <div className="flex flex-col w-full h-full gap-6">
        <Skeleton className="h-6 w-32" />
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
    <div className="flex flex-col w-full h-full gap-6 overflow-y-auto">
      {(user?.role === 'admin' || user?.role === 'staff') && <AdminDashboard />}
      {user?.role === 'business' && <BusinessDashboard />}
      {user?.role === 'collector' && <CollectorDashboard />}
    </div>
  );
}
