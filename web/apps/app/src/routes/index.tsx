import { createFileRoute } from '@tanstack/react-router';
import {
  Boxes,
  ClipboardList,
  Leaf,
  PackageOpen,
  Receipt,
  Search,
  TrendingUp,
  Users,
} from 'lucide-react';
import { Guarded } from '@/components/access-guard';
import { DataState } from '@/components/data-state';
import { LinkButton } from '@/components/link-button';
import { PageHeader, Section } from '@/components/page-header';
import { StatCard, StatGrid } from '@/components/stat-card';
import { PersonAvatar } from '@/components/visuals';
import { isStaffRole } from '@/lib/access';
import {
  co2For,
  community,
  formatCo2,
  kgFor,
  topStoresByImpact,
} from '@/lib/impact';
import { formatKg, formatRand, lineCents } from '@/lib/format';
import { myCollectorId } from '@/lib/data/ledger';
import { useMock, usePerson } from '@/lib/mock/hooks';
import {
  CollectionRows,
  MaterialsPanel,
  Panel,
  QuickLinks,
  ThreadRows,
} from './-dashboard/panels';

export const Route = createFileRoute('/')({
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <Guarded page="dashboard">
      <Dashboard />
    </Guarded>
  );
}

function Dashboard() {
  const { role } = useMock();

  if (isStaffRole(role)) return <StaffDashboard />;
  if (role === 'collector') return <CollectorDashboard />;

  return <BusinessDashboard />;
}

function StaffDashboard() {
  const { data } = useMock();

  return (
    <>
      <PageHeader
        title="A clear view of the trade."
        description="What is moving, who is buying and what needs a hand."
        actions={<LinkButton to="/transactions">View transactions</LinkButton>}
      />
      <StatGrid>
        <StatCard label="Materials traded" value="28 640 kg" icon={Boxes} />
        <StatCard label="Trade value" value="R 142 680.00" icon={Receipt} />
        <StatCard label="Active collectors" value="128" icon={Users} />
        <StatCard label="Open requests" value="24" icon={ClipboardList} />
      </StatGrid>
      <ImpactTiles />
      <Section title="This week">
        <DataState
          icon={ClipboardList}
          emptyTitle="No activity yet"
          emptyText="Deals and chats show up here as they happen."
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel
              title="Recent marketplace activity"
              action={
                <LinkButton to="/messages" variant="ghost" size="sm">
                  View all
                </LinkButton>
              }
            >
              <ThreadRows requests={data.requests.slice(0, 5)} />
            </Panel>
            <MaterialsPanel />
          </div>
        </DataState>
      </Section>
      <Section title="Top impact stores" description="By CO₂e saved this year">
        <TopStores />
      </Section>
      <Section title="Keep the marketplace moving">
        <QuickLinks
          links={[
            { to: '/materials', label: 'Materials', icon: Boxes },
            { to: '/collections', label: 'Collections', icon: ClipboardList },
            { to: '/collectors', label: 'Collectors', icon: Users },
          ]}
        />
      </Section>
    </>
  );
}

function BusinessDashboard() {
  const { data } = useMock();
  const person = usePerson();

  return (
    <>
      <PageHeader
        title={`Morning, ${person.name.split(' ')[0]}.`}
        description="Here is what happened since you last looked."
        actions={<LinkButton to="/messages">Go to messages</LinkButton>}
      />
      <StatGrid>
        <StatCard label="Purchased this month" value="4 280 kg" icon={Boxes} />
        <StatCard label="Sales this month" value="R 18 640.00" icon={Receipt} />
        <StatCard label="Stock available" value="7 250 kg" icon={PackageOpen} />
        <StatCard
          label="Needs a reply"
          value="3 requests"
          icon={ClipboardList}
        />
      </StatGrid>
      <ImpactTiles />
      <Section title="This week">
        <DataState
          icon={ClipboardList}
          emptyTitle="No conversations yet"
          emptyText="Ask a seller about a listing to start one."
          emptyAction={<LinkButton to="/market">Browse materials</LinkButton>}
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel
              title="Pick up the conversation"
              action={
                <LinkButton to="/messages" variant="ghost" size="sm">
                  View all
                </LinkButton>
              }
            >
              <ThreadRows requests={data.requests.slice(0, 4)} />
            </Panel>
            <MaterialsPanel />
          </div>
        </DataState>
      </Section>
      <Section title="Your workspace">
        <QuickLinks
          links={[
            { to: '/market', label: 'Browse materials', icon: Search },
            { to: '/stock', label: 'Manage stock', icon: PackageOpen },
            {
              to: '/collections',
              label: 'Record a collection',
              icon: ClipboardList,
            },
            {
              to: '/transactions/sales',
              label: 'View sales',
              icon: TrendingUp,
            },
          ]}
        />
      </Section>
    </>
  );
}

function CollectorDashboard() {
  const { data } = useMock();
  const person = usePerson();
  // Only this collector's own sales, never another collector's.
  const mine = data.transactions.filter(
    (row) => row.type === 'C2B' && row.collectorId === myCollectorId
  );
  const earned = mine.reduce(
    (sum, row) => sum + lineCents(row.pricePerKg, row.kg),
    0
  );

  return (
    <>
      <PageHeader
        title={`Welcome back, ${person.name.split(' ')[0]}.`}
        description="Your collections and what they earned you."
        actions={<LinkButton to="/profile">Your profile</LinkButton>}
      />
      <StatGrid>
        <StatCard
          label="Collected"
          value={formatKg(kgFor(mine))}
          icon={Boxes}
        />
        <StatCard
          label="Your earnings"
          value={formatRand(earned)}
          icon={Receipt}
        />
        <StatCard
          label="Collections"
          value={String(mine.length)}
          icon={ClipboardList}
        />
        <StatCard
          label="CO₂ avoided"
          value={formatCo2(co2For(mine))}
          icon={Leaf}
        />
      </StatGrid>
      <Section title="This week">
        <DataState
          isEmpty={mine.length === 0}
          icon={ClipboardList}
          emptyTitle="No collections yet"
          emptyText="Collections you sell to a business show up here."
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Your recent collections">
              <CollectionRows rows={mine.slice(0, 4)} />
            </Panel>
            <Panel
              title="Your material impact"
              description="Last 6 weeks, in kg"
            >
              <MaterialsPanel />
            </Panel>
          </div>
        </DataState>
      </Section>
    </>
  );
}

/** CO₂e and kg diverted as fixed numbers from mock state (design 09). */
function ImpactTiles() {
  return (
    <div className="mt-4">
      <StatGrid>
        <StatCard
          label="CO₂e saved on 3REco"
          value={formatCo2(community.co2Kg)}
          hint="Every deal counts. Fixed for this preview."
          icon={Leaf}
        />
        <StatCard
          label="Kg diverted from landfill"
          value={formatKg(community.kgDiverted)}
          hint={`${community.deals.toLocaleString('en-ZA')} deals so far`}
          icon={Boxes}
        />
      </StatGrid>
    </div>
  );
}

function TopStores() {
  const { data } = useMock();
  const top = topStoresByImpact(data.transactions);

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {top.map(({ store, kg, co2Kg }, index) => (
        <li
          key={store.id}
          className="flex items-center gap-3 rounded-2xl border p-4"
        >
          <span className="w-5 text-sm text-muted-foreground tabular-nums">
            {index + 1}
          </span>
          <PersonAvatar name={store.name} />
          <span className="min-w-0">
            <span className="block truncate font-medium">{store.name}</span>
            <span className="block text-sm text-muted-foreground">
              {formatCo2(co2Kg)} · {formatKg(kg)}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
