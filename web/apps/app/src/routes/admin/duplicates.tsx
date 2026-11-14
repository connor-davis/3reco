import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { CopyCheck } from 'lucide-react';
import { Guarded } from '@/components/access-guard';
import { DataState } from '@/components/data-state';
import { PageHeader, Section } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  useDuplicates,
  useMarkDuplicate,
  useUndoDuplicate,
  useDismissDuplicates,
} from '@/lib/api/duplicates';
import type { Transaction } from '@/lib/api/types';
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

function TradeSummary({ trade }: { trade: Transaction }) {
  return (
    <div className="min-w-0 space-y-3">
      <div>
        <h3 className="font-semibold">Invoice {trade.invoice_number}</h3>
        <p className="text-sm text-muted-foreground">
          {formatDate(
            trade.collection_day ?? trade.collection_date ?? trade.created_at
          )}
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

function DuplicatesPage() {
  const review = useDuplicates();
  const mark = useMarkDuplicate();
  const undo = useUndoDuplicate();
  const dismiss = useDismissDuplicates();
  const [error, setError] = useState('');
  const busy = mark.isPending || undo.isPending || dismiss.isPending;
  const groups = review.data?.groups ?? [];
  const marked = review.data?.marked ?? [];

  async function decide(action: () => Promise<unknown>) {
    setError('');
    try {
      await action();
    } catch (cause) {
      setError(errorText(cause));
    }
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
        isEmpty={groups.length === 0 && marked.length === 0}
        emptyTitle="No duplicates to review"
        emptyText="There are no matching trades or marked duplicates."
      >
        <div className="space-y-6">
          <Section
            title="Trades to review"
            description="The oldest record is suggested as the original."
          >
            {groups.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No matching trades to review.
              </p>
            )}
            <div className="space-y-6">
              {groups.map((group) => (
                <Section
                  key={`${group.kind}-${group.trades.map((trade) => trade.id).join('-')}`}
                  panel
                  title={
                    group.kind === 'exact' ? 'Exact match' : 'Possible match'
                  }
                  description={
                    group.kind === 'exact'
                      ? 'The parties, collection day and material lines match.'
                      : 'The parties, day and amount match, but the materials differ. Review these records before deciding.'
                  }
                >
                  <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                    {group.trades.map((trade) => (
                      <article
                        key={trade.id}
                        className="min-w-0 space-y-4 border-b pb-4"
                      >
                        <TradeSummary trade={trade} />
                        {trade.id === group.original_id ? (
                          <Badge variant="secondary">Suggested original</Badge>
                        ) : group.kind === 'exact' && trade.type === 'c2b' ? (
                          <Button
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              void decide(() =>
                                mark.mutateAsync({
                                  id: trade.id,
                                  original_id: group.original_id,
                                })
                              )
                            }
                          >
                            Mark as duplicate
                          </Button>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            {trade.type === 'b2b'
                              ? 'Business trades cannot be marked here.'
                              : 'Only exact matches can be marked.'}
                          </p>
                        )}
                      </article>
                    ))}
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
              ))}
            </div>
          </Section>
          <Section
            title="Duplicates marked"
            description="Marked copies stay in the records. Their invoices are void and their stock and totals are excluded."
          >
            {marked.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No trades have been marked as duplicates.
              </p>
            )}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {marked.map((trade) => (
                <article
                  key={trade.id}
                  className="min-w-0 space-y-4 rounded-2xl bg-muted/50 p-4"
                >
                  <Badge variant="secondary">Duplicate</Badge>
                  <TradeSummary trade={trade} />
                  <p className="break-all text-sm text-muted-foreground">
                    Original trade: {trade.duplicate_of}
                  </p>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void decide(() => undo.mutateAsync(trade.id))
                    }
                  >
                    Undo
                  </Button>
                </article>
              ))}
            </div>
          </Section>
        </div>
      </DataState>
    </>
  );
}
