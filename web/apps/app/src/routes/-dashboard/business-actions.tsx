import { ClipboardList, PackageOpen, Receipt } from 'lucide-react';
import { LinkButton } from '@/components/link-button';
import { StatCard } from '@/components/stat-card';
import type { Dashboard } from '@/lib/api/types';

export function BusinessActions({
  actions,
}: {
  actions: Dashboard['actions'];
}) {
  return (
    <div aria-label="Your priorities" className="grid gap-4 md:grid-cols-3">
      <StatCard
        tint="peach"
        label="Requests waiting for you"
        value={String(actions?.requests_waiting ?? 0)}
        icon={ClipboardList}
        action={
          <div className="flex flex-wrap gap-2">
            <LinkButton to="/market/incoming" variant="outline">
              Incoming requests
            </LinkButton>
            <LinkButton to="/market/outgoing" variant="outline">
              Outgoing requests
            </LinkButton>
          </div>
        }
      />
      <StatCard
        tint="lilac"
        label="Trades without an invoice yet"
        value={String(actions?.trades_to_invoice ?? 0)}
        icon={Receipt}
        action={
          <LinkButton to="/transactions" variant="outline">
            View trades
          </LinkButton>
        }
      />
      <StatCard
        tint="mint"
        label="Your listings"
        value={String(actions?.listings ?? 0)}
        icon={PackageOpen}
        action={
          <LinkButton to="/stock" variant="outline">
            View listings
          </LinkButton>
        }
      />
    </div>
  );
}
