import { createFileRoute, Link } from '@tanstack/react-router';
import { Receipt } from 'lucide-react';
import { Guarded } from '@/components/access-guard';
import { DataState } from '@/components/data-state';
import { TradeDetail } from '@/components/dialogs/record-dialogs';
import { useTransaction } from '@/lib/api/transactions';
import { useAuth } from '@/lib/auth/use-auth';

const lists = [
  '/transactions',
  '/transactions/',
  '/transactions/purchases',
  '/transactions/sales',
  '/collections',
];

export const Route = createFileRoute('/transactions/$transactionId')({
  validateSearch: (search: Record<string, unknown>) => ({
    from:
      typeof search.from === 'string' && lists.includes(search.from)
        ? search.from
        : undefined,
  }),
  component: () => (
    <Guarded page="dashboard">
      <TransactionPage />
    </Guarded>
  ),
});

function TransactionPage() {
  const { transactionId } = Route.useParams();
  const { from } = Route.useSearch();
  const { user } = useAuth();
  const query = useTransaction(transactionId);
  const fallback =
    user?.role === 'collector'
      ? '/transactions/sales'
      : user?.role === 'business'
        ? '/transactions/purchases'
        : '/transactions';

  return (
    <>
      <Link
        className="mb-4 inline-flex min-h-11 items-center text-sm text-primary underline-offset-4 hover:underline"
        to={from ?? fallback}
      >
        Back to {from === '/collections' ? 'collections' : 'transactions'}
      </Link>
      <DataState
        query={query}
        isEmpty={!query.data}
        icon={Receipt}
        emptyTitle="Trade not found"
        emptyText="This trade is unavailable."
      >
        {query.data && <TradeDetail key={transactionId} record={query.data} />}
      </DataState>
    </>
  );
}
