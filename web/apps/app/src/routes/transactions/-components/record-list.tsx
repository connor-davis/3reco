import { useState, type ReactNode } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { format } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { Boxes, Download, FileText, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { DataState, RowsSkeleton } from '@/components/data-state';
import {
  maxReceipts,
  TransactionDialog,
} from '@/components/dialogs/record-dialogs';
import { LinkButton } from '@/components/link-button';
import { ChipGroup } from '@/components/filters';
import { ChoiceSelect, SearchBox } from '@/components/filters';
import { PageHeader } from '@/components/page-header';
import { StatCard, StatGrid } from '@/components/stat-card';
import { Pager } from '@/components/transactions/list-tools';
import { errorText, usePager } from '@/components/transactions/pager-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@/components/ui/item';
import { useExport, type ExportKind } from '@/lib/api/exports';
import { useRequest } from '@/lib/api/requests';
import {
  useTransaction,
  useTransactions,
  useTransactionTotals,
} from '@/lib/api/transactions';
import type { Transaction } from '@/lib/api/types';
import { useAuth } from '@/lib/auth/use-auth';
import { useDebounced } from '@/lib/use-debounced';
import { waitingFor } from '@/lib/waiting';
import {
  formatDate,
  formatKg,
  formatRand,
  formatRate,
  toCents,
  toGrams,
} from '@/lib/format';

const day = (date: Date) => format(date, 'yyyy-MM-dd');

type Props = {
  title: string;
  description: string;
  // Which list the API serves: mine (all, for staff), purchases or sales.
  kind: 'mine' | 'purchases' | 'sales';
  // Which CSV the Export button downloads. Left out when the role has none.
  exportKind?: ExportKind;
  // Keep only collections (c2b) from the list.
  collectionsOnly?: boolean;
  emptyTitle: string;
  // Staff pages add a Business-to-business / collector filter.
  typeFilter?: boolean;
  actions?: ReactNode;
  // Collections show a stats row. Other pages skip it.
  stats?: boolean;
  readOnly?: boolean;
};

const typeOptions = [
  { value: 'all', label: 'All types' },
  { value: 'b2b', label: 'Business trade' },
  { value: 'c2b', label: 'Collector purchase' },
];

const csvOptions = [
  { value: 'transaction', label: 'One row per trade' },
  { value: 'material', label: 'One row per material' },
];

const dayOf = (row: Transaction) => row.collection_day ?? row.effective_at;

function weightOf(row: Transaction) {
  return row.items.reduce((sum, item) => sum + toGrams(item.weight), 0);
}

function titleOf(row: Transaction) {
  const names = row.items.map((item) => item.material_name);
  const more = names.length > 2 ? ` +${names.length - 2} more` : '';

  return `${names.slice(0, 2).join(', ')}${more} · ${formatKg(weightOf(row) / 1000)}`;
}

/** The "who are we waiting for" tag on a pending row. */
function WaitingTag({ requestId }: { requestId: string }) {
  const { user } = useAuth();
  const request = useRequest(requestId);

  if (!request.data) return null;

  return (
    <Badge variant="secondary">{waitingFor(request.data, user?.id)}</Badge>
  );
}

/** The shared record list: filters, optional stats, rows and the detail dialog. */
export function RecordList({
  title,
  description,
  kind,
  exportKind,
  collectionsOnly = false,
  emptyTitle,
  typeFilter = false,
  actions,
  stats = false,
  readOnly = false,
}: Props) {
  const [status, setStatus] = useState('complete');
  const [query, setQuery] = useState('');
  const [range, setRange] = useState<DateRange | undefined>();
  const [type, setType] = useState('all');
  const [csv, setCsv] = useState('transaction');
  const [open, setOpen] = useState<Transaction | null>(null);

  // A link such as /transactions/purchases?open=<id> opens that trade.
  const { open: openId } = useSearch({ strict: false }) as { open?: string };
  const navigate = useNavigate();
  const linked = useTransaction(openId ?? '');

  // The server does the searching, so the filters ride along with every page.
  const q = useDebounced(query.trim());
  const filters = {
    status: collectionsOnly ? 'complete' : status,
    q,
    // Collections are always c2b; the server filters, not this page.
    type: collectionsOnly ? 'c2b' : type === 'all' ? undefined : type,
    from: range?.from && day(range.from),
    to: range?.to && day(range.to),
  };
  const pager = usePager(50, filters);
  const list = useTransactions(kind, pager.params);
  const totals = useTransactionTotals(kind, filters);
  const download = useExport(exportKind ?? 'transactions');

  const shown = list.data?.items ?? [];
  const linkedRow = openId
    ? (shown.find((row) => row.id === openId) ?? linked.data ?? null)
    : null;
  const filtered = !!(q || range?.from || (!collectionsOnly && type !== 'all'));
  const caption = !filtered
    ? 'All time'
    : range?.from && !q && type === 'all'
      ? `${format(range.from, 'dd MMM')} – ${format(range.to ?? range.from, 'dd MMM yyyy')}`
      : 'Matching your filters';

  function exportCsv() {
    // The export routes want full timestamps, covering the whole last day.
    const to = range?.to && new Date(range.to);
    to?.setHours(23, 59, 59, 999);

    download.mutate(
      {
        from: range?.from?.toISOString(),
        to: to?.toISOString(),
        itemised: csv === 'material',
        type: filters.type,
      },
      { onError: (error) => toast.error(errorText(error)) }
    );
  }

  return (
    <>
      <PageHeader title={title} description={description} actions={actions} />
      {!collectionsOnly && (
        <ChipGroup
          label="Transaction status"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'complete', label: 'Complete' },
            { value: 'pending', label: 'Pending' },
          ]}
        />
      )}
      {stats && (
        <div className="mb-8">
          <StatGrid threeUp>
            <StatCard
              label="Collection value"
              value={formatRand(toCents(totals.data?.value ?? '0'))}
              hint={caption}
              icon={Receipt}
              isLoading={totals.isLoading}
              unavailable={totals.isError}
            />
            <StatCard
              label="Material weight"
              value={formatKg(totals.data?.weight ?? '0')}
              hint={caption}
              icon={Boxes}
              isLoading={totals.isLoading}
              unavailable={totals.isError}
            />
            <StatCard
              label="Collections"
              value={String(totals.data?.count ?? 0)}
              hint={caption}
              icon={FileText}
              isLoading={totals.isLoading}
              unavailable={totals.isError}
            />
          </StatGrid>
        </div>
      )}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <SearchBox
          label="Search records"
          value={query}
          onChange={setQuery}
          className="min-w-60 flex-1 sm:max-w-none"
        />
        <div className="flex flex-wrap items-center gap-3 max-sm:w-full">
          <DateRangePicker
            value={range}
            onChange={setRange}
            placeholder="From – to date"
            align="start"
          />
          {typeFilter && (
            <ChoiceSelect
              label="Transaction type"
              value={type}
              options={typeOptions}
              onChange={setType}
            />
          )}
          {exportKind && !readOnly && status === 'complete' && (
            <>
              <ChoiceSelect
                label="Export format"
                value={csv}
                options={csvOptions}
                onChange={setCsv}
              />
              <Button
                variant="outline"
                className="h-11"
                disabled={download.isPending}
                onClick={exportCsv}
              >
                <Download data-icon="inline-start" />
                Export
              </Button>
            </>
          )}
        </div>
      </div>
      <DataState
        query={list}
        isEmpty={shown.length === 0}
        icon={Receipt}
        emptyTitle={
          filtered
            ? 'No matching records'
            : status === 'pending'
              ? `No pending ${kind === 'mine' ? 'transactions' : kind}`
              : emptyTitle
        }
        emptyText={
          filtered
            ? 'Try other dates or words.'
            : status === 'pending'
              ? 'Agreed trades appear here while both sides confirm.'
              : 'They appear here once a deal is recorded.'
        }
        skeleton={<RowsSkeleton />}
      >
        <ItemGroup className="rounded-2xl border">
          {shown.map((row) => (
            <Item key={row.id}>
              <ItemContent className="min-w-48">
                <ItemTitle>{titleOf(row)}</ItemTitle>
                <ItemDescription>
                  {row.seller.name} → {row.buyer.name}
                </ItemDescription>
                <p className="text-xs text-muted-foreground">
                  {formatDate(dayOf(row))} · {row.invoice_number}
                  {row.items.length === 1 &&
                    ` · ${formatRate(row.items[0].price)}`}
                </p>
              </ItemContent>
              <ItemActions className="flex-wrap">
                <Badge variant="outline">
                  {row.type === 'b2b' ? 'Business trade' : 'Collector purchase'}
                </Badge>
                <span className="w-28 text-right font-semibold tabular-nums">
                  {formatRand(toCents(row.total_price))}
                </span>
                {row.status === 'pending' && row.request_id && (
                  <WaitingTag requestId={row.request_id} />
                )}
                {row.status === 'pending' && row.request_id ? (
                  <LinkButton
                    to="/messages/$requestId"
                    params={{ requestId: row.request_id }}
                    variant="outline"
                  >
                    View request
                  </LinkButton>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setOpen(row)}
                  >
                    {`Invoice and receipts (${row.receipts.length} of ${maxReceipts})`}
                  </Button>
                )}
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      </DataState>
      <Pager pager={pager} page={list.data} total={totals.data?.count} />
      <TransactionDialog
        key={(open ?? linkedRow)?.id}
        record={open ?? linkedRow}
        onClose={() => {
          setOpen(null);
          if (openId)
            void navigate({ to: '.', search: {} as never, replace: true });
        }}
      />
    </>
  );
}
