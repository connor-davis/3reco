import { useState } from 'react';
import { Ban } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataState } from '@/components/data-state';
import { Button } from '@/components/ui/button';
import { useBlocks, useUnblock, type Block } from '@/lib/api/blocks';
import { useReports } from '@/lib/api/reports';

export function BlockedPanel() {
  const blocks = useBlocks();
  const reports = useReports();
  const unblock = useUnblock();
  const [selected, setSelected] = useState<Block | null>(null);

  return (
    <div className="space-y-6">
      <DataState
        query={blocks}
        isEmpty={!blocks.data?.items.length}
        icon={Ban}
        emptyTitle="You have not blocked anyone."
        emptyText="Businesses you block will appear here."
      >
        <ul className="divide-y">
          {blocks.data?.items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-4 py-3"
            >
              <span className="min-w-0 break-words">{item.name}</span>
              <Button variant="outline" onClick={() => setSelected(item)}>
                Unblock
              </Button>
            </li>
          ))}
        </ul>
      </DataState>
      <ConfirmDialog
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
        title={`Unblock ${selected?.name ?? 'this business'}?`}
        description="You can contact each other again unless they have blocked you."
        confirmLabel="Unblock"
        destructive={false}
        pending={unblock.isPending}
        onConfirm={() => {
          if (selected)
            unblock.mutate(selected.party_id, {
              onSuccess: () => {
                setSelected(null);
                toast.success('Business unblocked.');
              },
              onError: (error) => toast.error(error.message),
            });
        }}
      />
      <section className="space-y-3">
        <h3 className="font-medium">Your reports</h3>
        <DataState
          query={reports}
          isEmpty={!reports.data?.items.length}
          icon={Ban}
          emptyTitle="You have not sent any reports."
          emptyText="Your report statuses will appear here."
        >
          <ul className="space-y-2">
            {reports.data?.items.map((report, index) => (
              <li key={report.id}>
                Report {index + 1}:{' '}
                {report.status === 'open' ? 'Open' : 'Reviewed'}
              </li>
            ))}
          </ul>
        </DataState>
      </section>
    </div>
  );
}
