import { createFileRoute } from '@tanstack/react-router';
import { Guarded } from '@/components/access-guard';
import { RecordList } from './-components/record-list';

export const Route = createFileRoute('/transactions/')({
  component: () => (
    <Guarded page="transactions">
      <AllTransactions />
    </Guarded>
  ),
});

function AllTransactions() {
  return (
    <RecordList
      title="All transactions"
      description="Every trade on the marketplace, with its paperwork."
      kind="mine"
      exportKind="transactions"
      emptyTitle="No transactions yet"
      typeFilter
    />
  );
}
