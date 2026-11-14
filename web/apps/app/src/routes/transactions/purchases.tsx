import { createFileRoute, Navigate } from '@tanstack/react-router';
import { Guarded } from '@/components/access-guard';
import { useAuth } from '@/lib/auth/use-auth';
import { RecordList } from './-components/record-list';

export const Route = createFileRoute('/transactions/purchases')({
  validateSearch: (search: Record<string, unknown>) => ({
    open: typeof search.open === 'string' ? search.open : undefined,
  }),
  component: () => (
    <Guarded page="purchases">
      <Purchases />
    </Guarded>
  ),
});

function Purchases() {
  const { user } = useAuth();
  const { open } = Route.useSearch();
  if (user?.role === 'business')
    return (
      <Navigate
        to="/transactions"
        search={{ filter: 'bought', open }}
        replace
      />
    );

  return (
    <RecordList
      title="Purchases"
      description="Materials coming in. Every purchase, invoice and receipt."
      kind="purchases"
      exportKind="purchases"
      emptyTitle="No purchases yet"
    />
  );
}
