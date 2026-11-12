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

  // A business buys for itself; admin and staff pick the business in the dialog.
  const canRecord =
    user?.role === 'business' ||
    user?.role === 'admin' ||
    user?.role === 'staff';
  const description = canRecord
    ? 'Record materials bought from collectors. Keep every receipt in one place.'
    : 'Review collections across the marketplace and their paperwork.';

  return (
    <>
      <RecordList
        title="Collections"
        description={description}
        kind="mine"
        exportKind="collections"
        collectionsOnly
        emptyTitle="No collections yet"
        stats
        actions={
          canRecord && (
            <Button
              aria-label="Record collection"
              onClick={() => setOpen(true)}
            >
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
