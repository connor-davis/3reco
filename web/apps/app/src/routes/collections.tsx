import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { Guarded } from '@/components/access-guard';
import { CollectionDialog } from '@/components/dialogs/collection-dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/use-auth';
import { RecordList } from './transactions/-components/record-list';

export const Route = createFileRoute('/collections')({
  component: () => (
    <Guarded page="collections">
      <CollectionsPage />
    </Guarded>
  ),
});

function CollectionsPage() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  // A business buys for itself. Staff would have to pick a business, and the
  // API has no list of businesses for that, so only businesses record here.
  const canRecord = user?.role === 'business';

  return (
    <>
      <RecordList
        title="Collections"
        description="Record materials bought from collectors. Keep every receipt in one place."
        kind="mine"
        exportKind="collections"
        collectionsOnly
        emptyTitle="No collections yet"
        stats
        actions={
          canRecord && (
            <Button onClick={() => setOpen(true)}>
              <Plus data-icon="inline-start" />
              Record collection
            </Button>
          )
        }
      />
      {canRecord && <CollectionDialog open={open} onOpenChange={setOpen} />}
    </>
  );
}
