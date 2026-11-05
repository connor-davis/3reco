import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import type { LucideIcon } from 'lucide-react';
import { StatusBadge } from '@/components/badges';
import { LinkButton } from '@/components/link-button';
import { PersonAvatar } from '@/components/visuals';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item';
import { materialById } from '@/lib/data/materials';
import { storeById } from '@/lib/data/stores';
import { formatKg, formatRand, lineCents } from '@/lib/format';
import type { MarketRequest, Transaction } from '@/lib/types';
import { ImpactChart } from './impact-chart';

type PanelProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
};

/** A titled Card used for the two big dashboard panels. */
export function Panel({ title, description, action, children }: PanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** The chart panel that sits beside the activity list. */
export function MaterialsPanel() {
  return (
    <Panel title="Materials on the move" description="Last 6 weeks, in kg">
      <ImpactChart />
    </Panel>
  );
}

/** Conversation rows for admin, staff and business. */
export function ThreadRows({ requests }: { requests: MarketRequest[] }) {
  return (
    <ItemGroup>
      {requests.map((request) => {
        const store = storeById(request.sellerId);

        return (
          <Item
            key={request.id}
            size="sm"
            render={
              <Link
                to="/messages/$requestId"
                params={{ requestId: request.id }}
              />
            }
          >
            <ItemMedia>
              <PersonAvatar name={store.name} online={store.online} />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{store.name}</ItemTitle>
              <ItemDescription>{request.preview}</ItemDescription>
            </ItemContent>
            <ItemActions>
              <StatusBadge status={request.status} />
            </ItemActions>
          </Item>
        );
      })}
    </ItemGroup>
  );
}

/** Collector payouts, newest first. */
export function CollectionRows({ rows }: { rows: Transaction[] }) {
  return (
    <ItemGroup>
      {rows.map((row) => (
        <Item key={row.id} size="sm">
          <ItemContent>
            <ItemTitle>{materialById(row.materialId).name}</ItemTitle>
            <ItemDescription>
              {formatKg(row.kg)} · {row.buyer}
            </ItemDescription>
          </ItemContent>
          <ItemActions className="flex-col items-end gap-1">
            <span className="font-medium tabular-nums">
              {formatRand(lineCents(row.pricePerKg, row.kg))}
            </span>
            <StatusBadge status={row.status} />
          </ItemActions>
        </Item>
      ))}
    </ItemGroup>
  );
}

type QuickLinkProps = { to: string; label: string; icon: LucideIcon };

/** One big link tile in the "workspace" row. */
export function QuickLinks({ links }: { links: QuickLinkProps[] }) {
  return (
    <div className="flex flex-wrap gap-3">
      {links.map(({ to, label, icon: Icon }) => (
        <LinkButton key={to} to={to} variant="outline" size="lg">
          <Icon data-icon="inline-start" />
          {label}
        </LinkButton>
      ))}
    </div>
  );
}
