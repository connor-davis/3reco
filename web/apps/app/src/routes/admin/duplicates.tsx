import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { differenceInCalendarDays } from 'date-fns';
import { CopyCheck } from 'lucide-react';
import { Guarded } from '@/components/access-guard';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataState } from '@/components/data-state';
import { PageHeader, Section } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  useDuplicates,
  useDeleteDuplicate,
  useDismissDuplicates,
  type DuplicateGroup,
  type DuplicateTrade,
} from '@/lib/api/duplicates';
import {
  formatDate,
  formatDateTime,
  formatKg,
  formatRand,
  toCents,
  plural,
} from '@/lib/format';
import { errorText } from '@/components/transactions/pager-state';

export const Route = createFileRoute('/admin/duplicates')({
  component: () => (
    <Guarded page="duplicates">
      <DuplicatesPage />
    </Guarded>
  ),
});

function TradeSummary({ trade }: { trade: DuplicateTrade }) {
  return (
    <div className="min-w-0 space-y-3">
      <div>
        <h3 className="font-semibold">Invoice {trade.invoice_number}</h3>
        <p className="text-sm text-muted-foreground">
          {formatDate(trade.collection_day ?? trade.effective_at)}
        </p>
        <p className="text-xs text-muted-foreground">
          Recorded {formatDateTime(trade.created_at)}
        </p>
      </div>
      <p className="break-words text-sm">
        {trade.seller.name} → {trade.buyer.name}
      </p>
      <ul className="space-y-2 text-sm">
        {trade.items.map((item, index) => (
          <li key={index}>
            <span className="font-medium">{item.material_name}</span>
            {trade.shared_lines[index] && (
              <Badge variant="secondary" className="ml-2">
                Matches
              </Badge>
            )}
            <div className="tabular-nums text-muted-foreground">
              {formatKg(item.weight)} · {formatRand(toCents(item.price))} / kg
            </div>
          </li>
        ))}
      </ul>
      <p className="font-semibold tabular-nums">
        {formatRand(toCents(trade.total_price))}
      </p>
      <p className="text-sm text-muted-foreground">
        {plural(trade.receipts.length, 'receipt', 'receipts')}
      </p>
    </div>
  );
}

/** Says how far apart the dates are when the trades were not collected on one day. */
function dateGap(group: DuplicateGroup) {
  const days = group.trades.map((trade) =>
    differenceInCalendarDays(
      new Date(trade.collection_day ?? trade.effective_at),
      new Date(group.trades[0].collection_day ?? group.trades[0].effective_at)
    )
  );
  const gap = Math.max(...days);
  return gap > 0 ? `${plural(gap, 'day', 'days')} apart` : '';
}

type Pending = { trade: DuplicateTrade; original: DuplicateTrade };

function DuplicatesPage() {
  const review = useDuplicates();
  const remove = useDeleteDuplicate();
  const dismiss = useDismissDuplicates();
  const [error, setError] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const busy = remove.isPending || dismiss.isPending;
  const groups = review.data?.groups ?? [];

  async function decide(action: () => Promise<unknown>) {
    setError('');
    try {
      await action();
    } catch (cause) {
      setError(errorText(cause));
    }
  }

  async function confirmDelete() {
    if (!pending) return;
    await decide(() =>
      remove.mutateAsync({
        id: pending.trade.id,
        original_id: pending.original.id,
      })
    );
    setPending(null);
  }

  return (
    <>
      <PageHeader
        title="Duplicates"
        description="Compare the records before deciding. A repeat delivery may be a real trade."
      />
      {error && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {error}
        </p>
      )}
      <DataState
        query={review}
        icon={CopyCheck}
        isEmpty={groups.length === 0}
        emptyTitle="No duplicates to review"
        emptyText="There are no trades that share a line."
      >
        <Section
          title="Trades to review"
          description="Trades from the same collector to the same business that share a line, on any date. The record with the most lines is suggested as the original."
        >
          <div className="space-y-6">
            {groups.map((group) => {
              const gap = dateGap(group);
              return (
                <Section
                  key={group.trades.map((trade) => trade.id).join('-')}
                  panel
                  title={
                    group.trades.some((trade) => trade.exact_copy)
                      ? 'Exact copy found'
                      : 'Shared lines'
                  }
                  description={`${plural(group.trades.length, 'trade', 'trades')} share at least one identical line${gap ? ` (${gap})` : ''}.`}
                >
                  <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                    {group.trades.map((trade) => {
                      const original = group.trades.find(
                        (item) => item.id === trade.contained_in
                      );
                      return (
                        <article
                          key={trade.id}
                          className="min-w-0 space-y-4 border-b pb-4"
                        >
                          <div className="flex flex-wrap gap-2">
                            {trade.id === group.original_id && (
                              <Badge variant="secondary">
                                Suggested original
                              </Badge>
                            )}
                            {trade.exact_copy && <Badge>Exact copy</Badge>}
                          </div>
                          <TradeSummary trade={trade} />
                          {trade.id === group.original_id ? null : original ? (
                            <Button
                              variant="outline"
                              disabled={busy}
                              onClick={() => setPending({ trade, original })}
                            >
                              Delete copy of {original.invoice_number}
                            </Button>
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              {trade.type === 'b2b'
                                ? 'Business trades cannot be deleted here.'
                                : 'This trade has lines the others do not, so it cannot be deleted as a copy.'}
                            </p>
                          )}
                        </article>
                      );
                    })}
                  </div>
                  <Button
                    className="mt-4"
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      void decide(() =>
                        dismiss.mutateAsync({
                          ids: group.trades.map((trade) => trade.id),
                        })
                      )
                    }
                  >
                    Not a duplicate
                  </Button>
                </Section>
              );
            })}
          </div>
        </Section>
      </DataState>
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={`Delete copy of ${pending?.original.invoice_number ?? ''}?`}
        description={
          pending
            ? `This deletes invoice ${pending.trade.invoice_number} for good. It is a copy of invoice ${pending.original.invoice_number}. Stock coming off: ${pending.trade.items
                .map((item) => `${item.material_name} ${formatKg(item.weight)}`)
                .join(', ')}. This can't be undone.`
            : ''
        }
        cancelLabel="Cancel"
        confirmLabel="Delete copy"
        pending={remove.isPending}
        onConfirm={() => void confirmDelete()}
      />
    </>
  );
}
