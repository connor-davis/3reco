import { createFileRoute } from '@tanstack/react-router';
import { Guarded } from '@/components/access-guard';
import { useAuth } from '@/lib/auth/use-auth';
import { RecordList } from './-components/record-list';

export const Route = createFileRoute('/transactions/sales')({
  component: () => (
    <Guarded page="sales">
      <Sales />
    </Guarded>
  ),
});

function Sales() {
  const { user } = useAuth();
  const isCollector = user?.role === 'collector';

  return (
    <RecordList
      title="Sales"
      description={
        isCollector
          ? 'Your collections sold to businesses. Read only.'
          : 'Your completed and agreed sales, with the paperwork to match.'
      }
      kind="sales"
      exportKind="sales"
      emptyTitle="No sales yet"
      readOnly={isCollector}
    />
  );
}
