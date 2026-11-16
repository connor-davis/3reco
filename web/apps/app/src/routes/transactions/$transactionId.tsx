import { createFileRoute } from '@tanstack/react-router';
import { Receipt } from 'lucide-react';
import { Guarded } from '@/components/access-guard';
import { BackButton } from '@/components/back-button';
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
    user?.role === 'collector' ? '/transactions/sales' : '/transactions';

  return (
    <>
      <BackButton fallback={from ?? fallback} className="mb-4" />
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
