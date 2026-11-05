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

function Dashboard() {
  const { user } = useAuth();
  const staff = user?.role === 'admin' || user?.role === 'staff';
  const collector = user?.role === 'collector';
  const kind = staff ? 'admin' : collector ? 'collector' : 'business';
  const query = useDashboard(kind);
  const dashboard = query.data;

  return (
    <>
      <PageHeader
        title={
          staff
            ? 'A clear view of the trade.'
            : 'Welcome back, ' +
              (user?.firstName || user?.name || 'there') +
              '.'
        }
        description="Your settled trades over the last 30 days."
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
          <p className="mb-6 rounded-xl border p-4 text-sm">
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
                label={collector ? 'Collected' : 'Materials traded'}
                value={formatKg(dashboard.totals.weight)}
                icon={Boxes}
              />
              <StatCard
                label={collector ? 'Your earnings' : 'Trade value'}
                value={formatRand(toCents(dashboard.totals.value))}
                icon={Receipt}
              />
              <StatCard
                label={collector ? 'Collections' : 'Settled trades'}
                value={String(dashboard.totals.count)}
                icon={ClipboardList}
              />
              <StatCard
                label="CO₂e saved"
                value={formatKg(dashboard.totals.carbon_savings) + ' CO₂e'}
                icon={Leaf}
              />
            </StatGrid>
            <Section
              title="Trade activity"
              description={
                'From ' + formatDate(dashboard.from) + ' over the last 30 days'
              }
            >
              <div className="grid gap-6 lg:grid-cols-2">
                <RecentActivity collector={collector} />
                <CounterpartyRows rows={dashboard.counterparties} />
                <MaterialsPanel series={dashboard.series} />
              </div>
            </Section>
            {staff && dashboard.users && (
              <Section title="People on 3REco">
                <ul className="flex flex-wrap gap-6">
                  {dashboard.users.map((group) => (
                    <li key={group.role} className="text-sm">
                      <span className="font-medium">{group.count}</span>{' '}
                      {group.role || 'without a role'}
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
                  { to: '/profile', label: 'Your profile', icon: Users },
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
      title="Our community's impact"
      description="All settled trades on 3REco"
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
            <StatGrid>
              <StatCard
                label="Materials traded"
                value={formatKg(stats.total_kg)}
                icon={Boxes}
              />
              <StatCard
                label="CO₂e saved"
                value={formatKg(stats.co2_kg) + ' CO₂e'}
                icon={Leaf}
              />
              <StatCard
                label="Settled trades"
                value={String(stats.deals)}
                icon={Receipt}
              />
            </StatGrid>
            <h3 className="font-medium">Top stores by material traded</h3>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {stats.top_stores.map((store, index) => (
                <li key={store.id} className="rounded-2xl border p-4">
                  <span className="block text-sm text-muted-foreground">
                    {index + 1}. {formatKg(store.kg)}
                  </span>
                  <LinkButton
                    className="min-h-11"
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
