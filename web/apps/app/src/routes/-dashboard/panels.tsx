import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Users, MessageCircle, Receipt } from 'lucide-react';
import { useInbox } from '@/lib/api/messages';
import { useTransactions } from '@/lib/api/transactions';
import { DataState } from '@/components/data-state';
import { LinkButton } from '@/components/link-button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { Dashboard } from '@/lib/api/types';
import {
  formatDate,
  formatKg,
  formatRand,
  toCents,
  plural,
} from '@/lib/format';
import { messageText } from '@/components/chat/helpers';
import { ThreadMaterials } from '@/components/chat/cards';
import { ImpactChart } from './impact-chart';
import { useAuth } from '@/lib/auth/use-auth';
import { cn } from '@/lib/utils';

export function Panel({
  title,
  description,
  action,
  children,
  className,
  contentClassName,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card className={cn('h-full', className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent
        className={cn('flex min-h-0 flex-1 flex-col', contentClassName)}
      >
        {children}
      </CardContent>
    </Card>
  );
}

export function MaterialsPanel({
  series,
  className,
}: {
  series: Dashboard['series'];
  className?: string;
}) {
  return (
    <Panel
      className={className}
      title="Materials on the move"
      description="Daily weight traded, in kg"
    >
      <ImpactChart series={series} />
    </Panel>
  );
}

export function CounterpartyRows({
  rows,
  tradesTo = '/transactions',
  platformTotals,
}: {
  rows: Dashboard['counterparties'];
  tradesTo?: '/transactions' | '/transactions/sales';
  // Admin and staff: a trade is a row under both its partners, so the rows
  // cannot be added up. Pass the platform's own totals, each trade once.
  platformTotals?: Dashboard['totals'];
}) {
  // Integer cents and counts, so the summary matches the rows exactly.
  const trades =
    platformTotals?.count ?? rows.reduce((sum, party) => sum + party.count, 0);
  const cents = platformTotals
    ? toCents(platformTotals.value)
    : rows.reduce((sum, party) => sum + toCents(party.value), 0);
  return (
    <Panel
      title="Trading partners"
      description="Settled trades in this period, buying and selling"
    >
      <DataState
        isEmpty={rows.length === 0}
        icon={Users}
        emptyTitle="No trading partners yet"
        emptyText="Partners will appear when a trade settles."
      >
        <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
          {rows.map((party) => (
            <li
              key={party.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <span className="min-w-0 break-words font-medium">
                {party.name}
              </span>
              <span className="text-sm text-muted-foreground">
                {plural(party.count, 'trade')} ·{' '}
                {formatRand(toCents(party.value))}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {plural(trades, 'trade')} · {formatRand(cents)}
            </span>{' '}
            {platformTotals ? 'in this period' : 'across these partners'}
          </p>
          <LinkButton className="min-h-11" to={tradesTo} variant="outline">
            View all trades
          </LinkButton>
        </div>
      </DataState>
    </Panel>
  );
}

export function QuickLinks({
  links,
}: {
  links: { to: string; label: string; icon: LucideIcon }[];
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {links.map(({ to, label, icon: Icon }) => (
        <LinkButton
          className="min-h-11"
          key={to}
          to={to}
          variant="outline"
          size="lg"
        >
          <Icon data-icon="inline-start" />
          {label}
        </LinkButton>
      ))}
    </div>
  );
}

function RecentThreads() {
  const { user } = useAuth();
  const query = useInbox({ limit: 4 });
  return (
    <Panel title="Recent conversations" className="gap-3">
      <DataState
        query={query}
        isEmpty={query.data?.items.length === 0}
        icon={MessageCircle}
        emptyTitle="No conversations yet"
        emptyText={
          user?.role === 'staff'
            ? 'Staff do not take part in trade chats.'
            : 'Ask a seller about a listing to start one.'
        }
      >
        <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
          {query.data?.items.map((thread) => (
            <li key={thread.request_id} className="py-3 first:pt-0">
              <LinkButton
                className="min-h-11 px-0 text-foreground"
                to={'/messages/' + thread.request_id}
                variant="link"
              >
                {thread.other.name}
              </LinkButton>
              <ThreadMaterials requestId={thread.request_id} />
              <p className="line-clamp-2 text-sm text-muted-foreground">
                {messageText(thread.latest_message?.content ?? 'New request')}
              </p>
              {thread.unread_count > 0 && (
                <p className="text-sm">{thread.unread_count} unread</p>
              )}
            </li>
          ))}
        </ul>
      </DataState>
    </Panel>
  );
}

function RecentCollections() {
  const query = useTransactions('sales', { limit: 4, order: 'recorded' });
  return (
    <Panel title="Your recent collections">
      <DataState
        query={query}
        isEmpty={query.data?.items.length === 0}
        icon={Receipt}
        emptyTitle="No collections yet"
        emptyText="Your settled collections will appear here."
      >
        <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
          {query.data?.items.map((trade) => (
            <li key={trade.id} className="space-y-1 py-3">
              <p className="font-medium">{trade.buyer.name}</p>
              <p className="text-sm text-muted-foreground">
                {trade.items
                  .map(
                    (item) => item.material_name + ' · ' + formatKg(item.weight)
                  )
                  .join(', ')}
              </p>
              <p className="text-sm">
                {formatRand(toCents(trade.total_price))} ·{' '}
                {formatDate(trade.effective_at)}
              </p>
            </li>
          ))}
        </ul>
      </DataState>
      <LinkButton
        className="mt-auto min-h-11 self-start"
        to="/transactions/sales"
        variant="link"
      >
        View all sales
      </LinkButton>
    </Panel>
  );
}

export function RecentActivity({ collector }: { collector: boolean }) {
  return collector ? <RecentCollections /> : <RecentThreads />;
}
