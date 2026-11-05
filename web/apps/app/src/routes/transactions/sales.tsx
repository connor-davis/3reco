import { createFileRoute } from '@tanstack/react-router';
import { Guarded } from '@/components/access-guard';
import { myBusinessName, myCollectorId } from '@/lib/data/ledger';
import { useMock } from '@/lib/mock/hooks';
import { RecordList } from './-components/record-list';

export const Route = createFileRoute('/transactions/sales')({
  component: () => (
    <Guarded page="sales">
      <Sales />
    </Guarded>
  ),
});

function Sales() {
  const { role, data } = useMock();
  const isCollector = role === 'collector';

  return (
    <RecordList
      title="Sales"
      description={
        isCollector
          ? 'Your collections sold to businesses. Read only.'
          : 'Your completed and agreed sales, with the paperwork to match.'
      }
      rows={data.transactions.filter((row) =>
        isCollector
          ? row.collectorId === myCollectorId
          : row.seller === myBusinessName
      )}
      emptyTitle="No sales yet"
      readOnly={isCollector}
    />
  );
}
