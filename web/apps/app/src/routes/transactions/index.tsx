import { createFileRoute } from '@tanstack/react-router';
import { Guarded } from '@/components/access-guard';
import { useAuth } from '@/lib/auth/use-auth';
import { RecordList } from './-components/record-list';

export const Route = createFileRoute('/transactions/')({
  validateSearch: (
    search: Record<string, unknown>
  ): {
    filter?: 'all' | 'bought' | 'sold';
    open?: string;
  } => ({
    filter:
      search.filter === 'bought' || search.filter === 'sold'
        ? search.filter
        : 'all',
    open: typeof search.open === 'string' ? search.open : undefined,
  }),
  component: () => (
    <Guarded page="transactions">
      <AllTransactions />
    </Guarded>
  ),
});

function AllTransactions() {
  const { user } = useAuth();
  const { filter = 'all' } = Route.useSearch();
  const navigate = Route.useNavigate();
  const business = user?.role === 'business';
  const kind =
    business && filter === 'bought'
      ? 'purchases'
      : business && filter === 'sold'
        ? 'sales'
        : 'mine';

  return (
    <RecordList
      key={user?.active_business_id ?? user?.role}
      title={business ? 'Transactions' : 'All transactions'}
      description={
        business
          ? 'Materials you bought and sold, with their paperwork.'
          : 'Every trade on the marketplace, with its paperwork.'
      }
      kind={kind}
      exportKind={
        business ? (kind === 'mine' ? undefined : kind) : 'transactions'
      }
      exportHint={
        business && kind === 'mine'
          ? 'Pick Bought or Sold to export'
          : undefined
      }
      emptyTitle="No transactions yet"
      typeFilter={!business}
      businessFilter={business ? filter : undefined}
      onBusinessFilterChange={(filter) => {
        void navigate({
          search: (previous) => ({
            ...previous,
            filter: filter === 'bought' || filter === 'sold' ? filter : 'all',
          }),
        });
      }}
    />
  );
}
