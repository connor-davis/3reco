import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Guarded } from '@/components/access-guard';
import { ButtonRow } from '@/components/button-row';
import { DataState } from '@/components/data-state';
import { PageHeader } from '@/components/page-header';
import { Panel } from '@/components/panel';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  useApproveCollectorChange,
  useCollectorChanges,
  useRejectCollectorChange,
  type CollectorChange,
} from '@/lib/api/collector-changes';
import { formatDate } from '@/lib/format';

export const Route = createFileRoute('/collector-changes')({
  component: () => (
    <Guarded page="collectorChanges">
      <CollectorChangesPage />
    </Guarded>
  ),
});

function CollectorChangesPage() {
  const query = useCollectorChanges();
  const approve = useApproveCollectorChange();
  const reject = useRejectCollectorChange();
  const [rejecting, setRejecting] = useState<CollectorChange | null>(null);
  const [reason, setReason] = useState('');
  const pending = approve.isPending || reject.isPending;

  function close() {
    setRejecting(null);
    setReason('');
  }

  return (
    <>
      <PageHeader
        title="Collector changes"
        description="Businesses suggest edits to collectors they did not add. Nothing changes until you approve it."
      />
      <DataState
        query={query}
        isEmpty={!query.data?.items.length}
        icon={UserCheck}
        emptyTitle="Nothing to review"
        emptyText="Suggested collector changes will appear here."
      >
        <div className="space-y-4">
          {query.data?.items.map((change) => (
            <Panel key={change.id} title={change.collector_name}>
              <div className="min-w-0 space-y-3 break-words">
                <p className="text-sm text-muted-foreground">
                  From {change.business_name} · {formatDate(change.created_at)}
                </p>
                <ul className="space-y-2">
                  {change.changes.map((line) => (
                    <li key={line.field} className="text-sm">
                      <span className="font-medium">{line.label}: </span>
                      <span className="text-muted-foreground line-through">
                        {line.old || 'Empty'}
                      </span>{' '}
                      <span>{line.new || 'Cleared'}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <ButtonRow className="mt-4 flex-wrap">
                <Button
                  disabled={pending}
                  onClick={() =>
                    approve.mutate(change.id, {
                      onSuccess: () => toast.success('Change approved.'),
                      onError: (error: Error) => toast.error(error.message),
                    })
                  }
                >
                  Approve
                </Button>
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() => setRejecting(change)}
                >
                  Reject
                </Button>
              </ButtonRow>
            </Panel>
          ))}
        </div>
      </DataState>
      <Dialog
        open={rejecting !== null}
        onOpenChange={(open) => !open && close()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject this change?</DialogTitle>
            <DialogDescription>
              The collector stays as it is. You can tell the business why.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            aria-label="Reason (optional)"
            placeholder="Reason (optional)"
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => {
                if (!rejecting) return;
                reject.mutate(
                  { id: rejecting.id, reason },
                  {
                    onSuccess: () => {
                      close();
                      toast.success('Change rejected.');
                    },
                    onError: (error: Error) => toast.error(error.message),
                  }
                );
              }}
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
