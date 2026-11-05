import { createFileRoute } from '@tanstack/react-router';
import { Guarded } from '@/components/access-guard';
import { RecordList } from './-components/record-list';

export const Route = createFileRoute('/transactions/purchases')({
  component: () => (
    <Guarded page="purchases">
      <Purchases />
    </Guarded>
  ),
});

function Purchases() {
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
