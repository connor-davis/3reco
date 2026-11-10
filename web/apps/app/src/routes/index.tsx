import { useEffect, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import {
  Boxes,
  ClipboardList,
  Leaf,
  PackageOpen,
  Receipt,
  Search,
  Users,
} from 'lucide-react';
import { Guarded } from '@/components/access-guard';
import { DataState } from '@/components/data-state';
import { LinkButton } from '@/components/link-button';
import { PageHeader, Section } from '@/components/page-header';
import { StatCard, StatGrid } from '@/components/stat-card';
import { useAuth } from '@/lib/auth/use-auth';
import { useDashboard } from '@/lib/api/dashboards';
import { useStats } from '@/lib/api/stats';
import { formatDate, formatKg, formatRand, toCents } from '@/lib/format';
import { formatCo2 } from '@/lib/impact';
import { roleLabel } from '@/lib/access';
import {
  CounterpartyRows,
  RecentActivity,
  MaterialsPanel,
  QuickLinks,
} from './-dashboard/panels';

export const Route = createFileRoute('/')({
  component: () => (
    <Guarded page="dashboard">
      <Dashboard />
    </Guarded>
  ),
});

// True on the first dashboard visit on this device, so a new person is
// greeted with "Welcome" and only then "Welcome back".
function useFirstVisit(id?: string) {
  const key = 'welcomed:' + id;
  const [first] = useState(() => {
    try {
      return !!id && !localStorage.getItem(key);
    } catch {
      return false; // storage is blocked: say "Welcome back", never "Welcome"
    }
  });

  useEffect(() => {
    try {
      if (id) localStorage.setItem(key, '1');
    } catch {
      // Nothing to remember it with; the greeting just stays "Welcome back".
    }
  }, [id, key]);

  return first;
}

function Dashboard() {
  const { user } = useAuth();
  const staff = user?.role === 'admin' || user?.role === 'staff';
  const collector = user?.role === 'collector';
  const kind = staff ? 'admin' : collector ? 'collector' : 'business';
  const query = useDashboard(kind);
  const first = useFirstVisit(user?.id);
  const dashboard = query.data;

  return (
    <>
      <PageHeader
        title={
          staff
            ? 'A clear view of the trade.'
            : (first ? 'Welcome, ' : 'Welcome back, ') +
              (user?.firstName || user?.name || 'there') +
              '.'
        }
        description={
          staff
            ? 'Everyone on 3REco, last 30 days.'
            : 'Your settled trades, last 30 days.'
        }
        actions={
          <LinkButton
            className="min-h-11"
            to={
              collector
                ? '/profile'
                : staff
                  ? '/transactions'
                  : '/transactions/purchases'
            }
          >
            {collector ? 'Your profile' : 'View transactions'}
          </LinkButton>
        }
      />
      {collector &&
        dashboard?.collector_linked === false &&
        !query.isError &&
        !query.isPending && (
          <p className="mb-6 rounded-lg border p-4 text-sm">
            Your account is not linked to a collector record yet. Check the
            phone number on your profile matches the number your business uses
            for collections.{' '}
            <LinkButton className="min-h-11" to="/profile" variant="outline">
              Update profile
            </LinkButton>
          </p>
        )}
      <DataState
        query={query}
        isEmpty={dashboard?.totals.count === 0}
        icon={ClipboardList}
        emptyTitle={
          collector ? 'No collections yet' : 'No trades in this period'
        }
        emptyText={
          collector
            ? 'Collections you sell to a business will appear here.'
            : 'Settled trades will appear here as they happen.'
        }
      >
        {dashboard && (
          <>
            <StatGrid>
              <StatCard
                label={
                  collector
                    ? 'Collected (30 days)'
                    : 'Materials traded (30 days)'
                }
                value={formatKg(dashboard.totals.weight)}
                icon={Boxes}
              />
              <StatCard
                label={
                  collector
                    ? 'Your earnings (30 days)'
                    : 'Trade value (30 days)'
                }
                value={formatRand(toCents(dashboard.totals.value))}
                icon={Receipt}
              />
              <StatCard
                label={
                  collector
                    ? 'Collections (30 days)'
                    : 'Settled trades (30 days)'
                }
                value={String(dashboard.totals.count)}
                icon={ClipboardList}
              />
              <StatCard
                label="CO₂e saved (30 days)"
                value={formatCo2(dashboard.totals.carbon_savings)}
                icon={Leaf}
              />
            </StatGrid>
            {staff && dashboard.by_type && (
              <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                {dashboard.by_type.map((row) => (
                  <li key={row.type}>
                    <span className="font-medium text-foreground">
                      {row.count}
                    </span>{' '}
                    {row.type === 'c2b'
                      ? 'Collections (collectors → businesses)'
                      : 'Business to business'}
                    , {formatKg(row.weight)}
                  </li>
                ))}
              </ul>
            )}
            <Section
              title="Trade activity"
              description={
                'From ' + formatDate(dashboard.from) + ' over the last 30 days'
              }
            >
              {/* Every panel gets the same height on wide screens; long lists
                  scroll inside their card instead of stretching the row. */}
              <div className="grid gap-6 lg:auto-rows-[30rem] lg:grid-cols-2">
                <RecentActivity collector={collector} />
                <CounterpartyRows
                  rows={dashboard.counterparties}
                  tradesTo={collector ? '/transactions/sales' : '/transactions'}
                  platformTotals={staff ? dashboard.totals : undefined}
                />
                <MaterialsPanel
                  className="lg:col-span-2"
                  series={dashboard.series}
                />
              </div>
            </Section>
            {staff && dashboard.users && (
              <Section title="People on 3REco">
                <ul className="flex flex-wrap gap-6">
                  {dashboard.users.map((group) => (
                    <li key={group.role} className="text-sm">
                      <span className="font-medium">{group.count}</span>{' '}
                      {roleLabel(group.role) || 'Without a role'}
                    </li>
                  ))}
                </ul>
              </Section>
            )}
            {!collector && <CommunityImpact />}
          </>
        )}
      </DataState>
      <Section title="Your workspace">
        <QuickLinks
          links={
            collector
              ? [
                  {
                    to: '/transactions/sales',
                    label: 'Your sales',
                    icon: Receipt,
                  },
                ]
              : staff
                ? [
                    { to: '/materials', label: 'Materials', icon: Boxes },
                    {
                      to: '/collections',
                      label: 'Collections',
                      icon: ClipboardList,
                    },
                    { to: '/collectors', label: 'Collectors', icon: Users },
                  ]
                : [
                    { to: '/market', label: 'Browse materials', icon: Search },
                    { to: '/stock', label: 'Manage stock', icon: PackageOpen },
                    {
                      to: '/collections',
                      label: 'Record a collection',
                      icon: ClipboardList,
                    },
                  ]
          }
        />
      </Section>
    </>
  );
}

function CommunityImpact() {
  const query = useStats();
  const stats = query.data;
  return (
    <Section
      title="Our community's impact — all time"
      description="Every settled trade on 3REco since the start, not just the last 30 days."
    >
      <DataState
        query={query}
        isEmpty={stats?.deals === 0}
        icon={Leaf}
        emptyTitle="Every trade counts"
        emptyText="Community impact will appear after the first settled trade."
      >
        {stats && (
          <div className="space-y-6">
            <StatGrid threeUp>
              <StatCard
                label="Materials traded (all time)"
                value={formatKg(stats.total_kg)}
                icon={Boxes}
              />
              <StatCard
                label="CO₂e saved (all time)"
                value={formatCo2(stats.co2_kg)}
                icon={Leaf}
              />
              <StatCard
                label="Settled trades (all time)"
                value={String(stats.deals)}
                icon={Receipt}
              />
            </StatGrid>
            <div>
              <h3 className="font-medium">Top stores by material traded</h3>
              <p className="text-sm text-muted-foreground">
                Collections bought and materials sold.
              </p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {stats.top_stores.map((store, index) => (
                <li key={store.id} className="rounded-lg border p-4">
                  <span className="block text-sm text-muted-foreground">
                    {index + 1}. {formatKg(store.kg)}
                  </span>
                  <LinkButton
                    className="min-h-11 px-0"
                    to={'/market/store/' + store.id}
                    variant="link"
                  >
                    {store.name}
                  </LinkButton>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DataState>
    </Section>
  );
}
