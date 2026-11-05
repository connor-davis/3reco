import { createFileRoute } from '@tanstack/react-router';
import { Guarded } from '@/components/access-guard';
import { LinkButton } from '@/components/link-button';
import { useMock } from '@/lib/mock/hooks';
import { RecordList } from './-components/record-list';

export const Route = createFileRoute('/transactions/')({
  component: () => (
    <Guarded page="transactions">
      <AllTransactions />
    </Guarded>
  ),
});

function AllTransactions() {
  const { data } = useMock();

  return (
    <RecordList
      title="All transactions"
      description="Every trade on the marketplace, with its paperwork."
      rows={data.transactions}
      emptyTitle="No transactions yet"
      typeFilter
      actions={
        <LinkButton to="/messages" variant="outline">
          Open messages
        </LinkButton>
      }
    />
  );
}
