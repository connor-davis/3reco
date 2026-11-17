import { useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Users, MessageCircle, Receipt } from 'lucide-react';
import { useTransactions } from '@/lib/api/transactions';
import { useInbox } from '@/lib/api/messages';
import { BusinessName } from '@/components/badges';
import { DataState } from '@/components/data-state';
import { LinkButton } from '@/components/link-button';
import { Panel } from '@/components/panel';
import type { Dashboard } from '@/lib/api/types';
import {
  formatDate,
  formatKg,
  formatRand,
  toCents,
  plural,
} from '@/lib/format';
import { ImpactChart } from './impact-chart';
import { useAuth } from '@/lib/auth/use-auth';

export function MaterialsPanel({
  series,
  className,
}: {
  series: Dashboard['series'];
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  const hasSeries =
    series.filter((day) => Number(day.weight) !== 0).length >= 3;

  // Under this width the weekly date labels would touch, so only the ends show.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const watch = new ResizeObserver(([entry]) =>
      setNarrow(entry.contentRect.width < 480)
    );
    watch.observe(el);

    return () => watch.disconnect();
  }, [hasSeries]);

  if (!hasSeries) return null;

  return (
    <div className={className}>
      <Panel
        title="Materials on the move"
        description="Daily weight traded, in kg"
      >
        <div ref={box}>
          <ImpactChart series={series} narrow={narrow} />
        </div>
      </Panel>
    </div>
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
      action={
        <LinkButton to={tradesTo} variant="link">
          See all
        </LinkButton>
      }
    >
      <DataState
        isEmpty={rows.length === 0}
        icon={Users}
        emptyTitle="No trading partners yet"
        emptyText="Partners will appear when a trade settles."
      >
        <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
          {rows.slice(0, 5).map((party) => (
            <li
              key={party.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <span className="min-w-0 break-words font-medium">
                <BusinessName
                  name={party.name}
                  verified={party.business_verified}
                />
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
    <div className="grid grid-cols-1 gap-2 has-[>:nth-child(2)]:grid-cols-2 has-[>:nth-child(3)]:grid-cols-3">
      {links.map(({ to, label, icon: Icon }) => (
        <LinkButton
          className="h-auto min-h-16 rounded-xl bg-card hover:bg-inner min-w-0 flex-col gap-2 px-1 py-3 text-center text-xs whitespace-nowrap sm:text-sm"
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

export function RecentCollections() {
  const query = useTransactions('sales', {
    limit: 5,
    order: 'recorded',
    type: 'c2b',
  });
  return (
    <Panel
      title="Your recent collections"
      action={
        <LinkButton to="/transactions/sales" variant="link">
          See all
        </LinkButton>
      }
    >
      <DataState
        query={query}
        isEmpty={query.data?.items.length === 0}
        icon={Receipt}
        emptyTitle="No collections yet"
        emptyText="Your settled collections will appear here."
      >
        <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
          {query.data?.items.slice(0, 5).map((trade) => (
            <li key={trade.id} className="space-y-1 py-3">
              <p className="font-medium">
                <BusinessName
                  name={trade.buyer.name}
                  verified={trade.buyer.business_verified}
                />
              </p>
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
    </Panel>
  );
}

export function NeedsAttention({ collector }: { collector: boolean }) {
  const { user } = useAuth();
  const query = useInbox({ limit: 5 });
  const waiting =
    query.data?.items.filter(
      (thread) =>
        thread.unread_count > 0 ||
        (thread.status === 'offered' &&
          (thread.buyer.id === user?.id
            ? thread.buyer_confirmed_version
            : thread.seller_confirmed_version) !== thread.offer_version)
    ) ?? [];

  return (
    <Panel title="Needs attention">
      {collector || user?.role === 'staff' ? (
        <LinkButton
          className="w-full justify-start"
          to="/profile"
          variant="secondary"
        >
          Check your payout details
        </LinkButton>
      ) : (
        <DataState
          query={query}
          isEmpty={!waiting.length}
          icon={MessageCircle}
          emptyTitle="You're up to date"
          emptyText="New messages and offers will appear here."
        >
          <ul className="space-y-2">
            {waiting.slice(0, 3).map((thread) => (
              <li key={thread.request_id}>
                <LinkButton
                  className="min-h-14 w-full justify-start rounded-lg border bg-inner whitespace-normal text-left"
                  to={'/messages/' + thread.request_id}
                  variant="ghost"
                >
                  {thread.other.name} ·{' '}
                  {thread.unread_count
                    ? `${thread.unread_count} unread`
                    : 'Offer awaiting confirmation'}
                </LinkButton>
              </li>
            ))}
          </ul>
        </DataState>
      )}
    </Panel>
  );
}
