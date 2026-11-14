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
import { TradeTypeLabel } from '@/components/badges';
import { DataState } from '@/components/data-state';
import { LinkButton } from '@/components/link-button';
import { PageHeader, Section } from '@/components/page-header';
import { StatCard, StatGrid } from '@/components/stat-card';
import { useAuth } from '@/lib/auth/use-auth';
import { useDashboard } from '@/lib/api/dashboards';
import { useStats } from '@/lib/api/stats';
import { formatKg, formatRand, toCents } from '@/lib/format';
import { formatCo2 } from '@/lib/impact';
import { roleLabel } from '@/lib/access';
import {
  CounterpartyRows,
  RecentActivity,
  NeedsAttention,
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

  const workspace = (
    <Section title="Your workspace">
      <QuickLinks
        links={
          collector
            ? [
                {
                  to: '/transactions/sales',
                  label: 'My collections',
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
                  {
                    to: '/collectors',
                    label: 'Collectors',
                    icon: Users,
                  },
                ]
              : [
                  {
                    to: '/market',
                    label: 'Browse',
                    icon: Search,
                  },
                  {
                    to: '/stock',
                    label: 'Stock',
                    icon: PackageOpen,
                  },
                  {
                    to: '/collections',
                    label: 'Collect',
                    icon: ClipboardList,
                  },
                ]
        }
      />
    </Section>
  );

  return (
    <div className="space-y-4 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0">
      <PageHeader
        compactActionsBelow
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
            : collector
              ? 'Your collections, last 30 days.'
              : 'Your settled trades, last 30 days.'
        }
        actions={
          <LinkButton
            className="min-h-11"
            to={collector ? '/profile' : '/transactions'}
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
            <StatGrid threeUp>
              <StatCard
                label={collector ? 'Collected' : 'Material traded'}
                value={formatKg(dashboard.totals.weight)}
                icon={Boxes}
              />
              <StatCard
                label={collector ? 'Earned' : 'Trade value'}
                value={formatRand(toCents(dashboard.totals.value))}
                icon={Receipt}
              />
              <StatCard
                label={collector ? 'Collections' : 'Settled trades'}
                value={String(dashboard.totals.count)}
                icon={ClipboardList}
              />
            </StatGrid>
            {workspace}
            {staff && dashboard.by_type && (
              <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                {dashboard.by_type.map((row) => (
                  <li key={row.type}>
                    <span className="font-medium text-foreground">
                      {row.count}
                    </span>{' '}
                    <TradeTypeLabel type={row.type} />, {formatKg(row.weight)}
                  </li>
                ))}
              </ul>
            )}

            <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
              <NeedsAttention collector={collector} />
              <MaterialsPanel
                series={dashboard.series}
                className="[&>section]:h-full"
              />
            </div>
            <RecentActivity collector={collector} />
            <CounterpartyRows
              rows={dashboard.counterparties}
              tradesTo={collector ? '/transactions/sales' : '/transactions'}
              platformTotals={staff ? dashboard.totals : undefined}
            />
            {staff && dashboard.users && (
              <Section panel title="People on 3REco">
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
            <CommunityImpact
              collector={collector}
              carbonSavings={dashboard.totals.carbon_savings}
            />
          </>
        )}
      </DataState>
      {(!dashboard ||
        dashboard.totals.count === 0 ||
        query.isPending ||
        query.isError) &&
        workspace}
    </div>
  );
}

function CommunityImpact({
  carbonSavings,
  collector,
}: {
  carbonSavings: string;
  collector: boolean;
}) {
  const query = useStats();
  const stats = query.data;
  return (
    <Section
      panel
      title={collector ? 'Collection impact' : 'Community impact'}
      action={
        !collector && (
          <LinkButton to="/market" variant="link">
            See all stores
          </LinkButton>
        )
      }
    >
      <p className="mb-3 text-sm">
        CO₂e saved in your last 30 days: {formatCo2(carbonSavings)}
      </p>
      {!collector && (
        <DataState
          query={query}
          isEmpty={stats?.deals === 0}
          icon={Leaf}
          emptyTitle="Every trade counts"
          emptyText="Community impact will appear after the first settled trade."
        >
          {stats && (
            <p className="text-sm text-muted-foreground">
              {formatKg(stats.total_kg)} traded · {formatCo2(stats.co2_kg)}{' '}
              saved · {stats.deals} settled trades, all time.
            </p>
          )}
        </DataState>
      )}
    </Section>
  );
}
