import { Link } from '@tanstack/react-router';
import { ClipboardList, PackageOpen, Receipt } from 'lucide-react';
import { StatCard } from '@/components/stat-card';
import type { Dashboard } from '@/lib/api/types';

const tile =
  'block rounded-xl transition-shadow [&>[data-slot=card]]:h-full hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none';

/** Three work counts; each whole tile opens the page where the work is done. */
export function BusinessActions({
  actions,
}: {
  actions: Dashboard['actions'];
}) {
  return (
    // Three across even on a phone, so the counts don't push everything else down.
    <div
      aria-label="Your priorities"
      className="grid grid-cols-3 gap-2 sm:gap-4"
    >
      <Link to="/market/incoming" className={tile}>
        <StatCard
          tint="peach"
          label="Requests waiting for you"
          value={String(actions?.requests_waiting ?? 0)}
          icon={ClipboardList}
          hint="Answer or confirm"
        />
      </Link>
      <Link to="/transactions" className={tile}>
        <StatCard
          tint="lilac"
          label="Trades without an invoice yet"
          value={String(actions?.trades_to_invoice ?? 0)}
          icon={Receipt}
          hint="Open your trades"
        />
      </Link>
      <Link to="/stock" search={{ new: undefined }} className={tile}>
        <StatCard
          tint="mint"
          label="Your listings"
          value={String(actions?.listings ?? 0)}
          icon={PackageOpen}
          hint="Manage stock"
        />
      </Link>
    </div>
  );
}
