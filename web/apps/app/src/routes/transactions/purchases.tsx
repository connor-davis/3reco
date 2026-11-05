import { createFileRoute } from '@tanstack/react-router';
import { Guarded } from '@/components/access-guard';
import { myBusinessName } from '@/lib/data/ledger';
import { useMock } from '@/lib/mock/hooks';
import { RecordList } from './-components/record-list';

export const Route = createFileRoute('/transactions/purchases')({
  component: () => (
    <Guarded page="purchases">
      <Purchases />
    </Guarded>
  ),
});

function Purchases() {
  const { data } = useMock();

  return (
    <RecordList
      title="Purchases"
      description="Materials coming in. Every purchase, invoice and receipt."
      rows={data.transactions.filter((row) => row.buyer === myBusinessName)}
      emptyTitle="No purchases yet"
    />
  );
}
