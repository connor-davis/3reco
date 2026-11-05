import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { Guarded } from '@/components/access-guard';
import { CollectionDialog } from '@/components/dialogs/collection-dialog';
import { Button } from '@/components/ui/button';
import { useMock } from '@/lib/mock/hooks';
import { RecordList } from './transactions/-components/record-list';

export const Route = createFileRoute('/collections')({
  component: () => (
    <Guarded page="collections">
      <CollectionsPage />
    </Guarded>
  ),
});

function CollectionsPage() {
  const { data } = useMock();
  const [open, setOpen] = useState(false);

  return (
    <>
      <RecordList
        title="Collections"
        description="Record materials bought from collectors. Keep every receipt in one place."
        rows={data.transactions.filter((row) => row.type === 'C2B')}
        emptyTitle="No collections yet"
        stats
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus data-icon="inline-start" />
            Record collection
          </Button>
        }
      />
      <CollectionDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
