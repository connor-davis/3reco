import type { PrivacyEvent } from './api/types';
import { roleLabel } from './access';
import { formatDateTime } from './format';

const privacyKinds: Record<string, string> = {
  export: 'Data download',
  delete: 'Account deletion',
  admin_full_view: 'Full identifier viewed',
  business_verify: 'Business verification changed',
};

export function eventLabel(event: {
  kind: string;
  details: PrivacyEvent['details'];
}) {
  const label = privacyKinds[event.kind] ?? 'Privacy activity';
  const invoice = event.details?.invoice_number;
  if (invoice) return `${label} · invoice ${invoice}`;

  const kind = event.details?.export_kind;
  if (!kind) return label;

  const exportLabels: Record<string, string> = {
    transactions: 'Transactions',
    collections: 'Collections',
    purchases: 'Purchases',
    sales: 'Sales',
    users: 'Users',
  };
  const filters = event.details.filters ?? {};
  const descriptions: string[] = [];
  if (kind !== 'users') {
    descriptions.push(
      filters.itemised === 'true' ? 'one row per material' : 'one row per trade'
    );
  }
  // A Collections export is c2b already; saying it twice reads oddly.
  if (filters.type === 'c2b' && kind !== 'collections')
    descriptions.push('Collections');
  if (filters.type === 'b2b') descriptions.push('Business trades');
  if (filters.q) descriptions.push(`Search: ${filters.q}`);
  if (
    filters.role &&
    ['guest', 'business', 'collector', 'staff', 'admin'].includes(filters.role)
  ) {
    descriptions.push(`Role: ${roleLabel(filters.role)}`);
  }
  if (filters.from) descriptions.push(`From ${formatDateTime(filters.from)}`);
  if (filters.to) descriptions.push(`To ${formatDateTime(filters.to)}`);

  return `${label} · ${exportLabels[kind] ?? 'Account records'}${descriptions.length ? ` (${descriptions.join(', ')})` : ''}`;
}
