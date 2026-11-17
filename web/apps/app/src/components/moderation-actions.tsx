import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ReportDialog } from '@/components/dialogs/report-dialog';
import { RowActions } from '@/components/row-actions';
import { canSeeTeam } from '@/lib/access';
import { useBlocks, useBlock, useUnblock } from '@/lib/api/blocks';
import { useAuth } from '@/lib/auth/use-auth';

export function ModerationActions({
  partyId,
  name,
  listingId,
}: {
  partyId: string;
  name: string;
  listingId?: string;
}) {
  const { user } = useAuth();
  const blocks = useBlocks();
  const block = useBlock();
  const unblock = useUnblock();
  const [reportOpen, setReportOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const blocked =
    blocks.data?.items.some((item) => item.party_id === partyId) ?? false;
  const change = blocked ? unblock : block;

  if (!canSeeTeam(user) || user?.active_business_id === partyId) return null;

  return (
    <>
      <RowActions
        name={name}
        actions={[
          { label: 'Report', onSelect: () => setReportOpen(true) },
          ...(!listingId
            ? [
                {
                  label: blocked ? 'Unblock' : 'Block',
                  destructive: !blocked,
                  disabled:
                    blocks.isPending || blocks.isError || change.isPending,
                  onSelect: () => setConfirmOpen(true),
                },
              ]
            : []),
        ]}
      />
      {reportOpen && (
        <ReportDialog
          open={reportOpen}
          onOpenChange={setReportOpen}
          kind={listingId ? 'listing' : 'party'}
          target={listingId ?? partyId}
        />
      )}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`${blocked ? 'Unblock' : 'Block'} ${name}?`}
        description={
          blocked
            ? 'You can contact each other again unless they have blocked you.'
            : 'Both businesses will stop seeing each other’s listings and cannot send messages, offers or new requests. Old trades stay available.'
        }
        confirmLabel={blocked ? 'Unblock' : 'Block'}
        destructive={!blocked}
        pending={change.isPending}
        onConfirm={() =>
          change.mutate(partyId, {
            onSuccess: () => {
              setConfirmOpen(false);
              toast.success(
                blocked ? 'Business unblocked.' : 'Business blocked.'
              );
            },
            onError: (error) => toast.error(error.message),
          })
        }
      />
    </>
  );
}
