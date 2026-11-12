import { useEffect, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useSearch } from '@tanstack/react-router';
import { format } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { Boxes, Download, FileText, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { DataState, RowsSkeleton } from '@/components/data-state';
import { DataTable } from '@/components/data-table';
import type { ColumnDef } from '@tanstack/react-table';
import { BusinessName, StatusBadge, TradeTypeLabel } from '@/components/badges';
import { ListRow } from '@/components/list-row';
import { ChoiceSelect, FilterTabs } from '@/components/filters';
import { Toolbar } from '@/components/toolbar';
import { PageHeader } from '@/components/page-header';
import { StatCard, StatGrid } from '@/components/stat-card';
import { Pager } from '@/components/transactions/list-tools';
import { errorText, usePager } from '@/components/transactions/pager-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { useExport, type ExportKind } from '@/lib/api/exports';
import { useRequest } from '@/lib/api/requests';
import { useTransactions, useTransactionTotals } from '@/lib/api/transactions';
import type { Transaction } from '@/lib/api/types';
import { useAuth } from '@/lib/auth/use-auth';
import { useDebounced } from '@/lib/use-debounced';
import { waitingFor } from '@/lib/waiting';
import {
  formatDate,
  formatKg,
  formatKgNumber,
  formatRand,
  plural,
  toCents,
  toGrams,
} from '@/lib/format';
import { tradeTypeLabel } from '@/lib/trade-type';

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
  { value: 'b2b', label: tradeTypeLabel('b2b') },
  { value: 'c2b', label: tradeTypeLabel('c2b') },
];

const csvOptions = (collectionsOnly: boolean) => [
  {
    value: 'transaction',
    label: collectionsOnly ? 'One row per collection' : 'One row per trade',
  },
  { value: 'material', label: 'One row per material' },
];

const dayOf = (row: Transaction) => row.collection_day ?? row.effective_at;

function weightOf(row: Transaction) {
  return row.items.reduce((sum, item) => sum + toGrams(item.weight), 0);
}

function Parties({ row }: { row: Transaction }) {
  return (
    <>
      <BusinessName
        wrap
        name={row.seller.name}
        verified={row.seller.business_verified}
      />
      {' → '}
      <BusinessName
        wrap
        name={row.buyer.name}
        verified={row.buyer.business_verified}
      />
    </>
  );
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

/** The shared record list: filters, optional stats, rows and trade page links. */
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

  // A link such as /transactions/purchases?open=<id> redirects to that trade page.
  const { open: openId } = useSearch({ strict: false }) as { open?: string };
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.pathname;

  useEffect(() => {
    if (openId)
      void navigate({
        to: '/transactions/$transactionId',
        params: { transactionId: openId },
        search: { from },
        replace: true,
      });
  }, [openId, from, navigate]);

  function openRow(row: Transaction) {
    if (row.status === 'pending' && row.request_id) {
      void navigate({
        to: '/messages/$requestId',
        params: { requestId: row.request_id },
      });
      return;
    }

    void navigate({
      to: '/transactions/$transactionId',
      params: { transactionId: row.id },
      search: { from },
    });
  }

  const columns: ColumnDef<Transaction>[] = [
    {
      id: 'date',
      header: 'Date / Invoice',
      meta: { className: 'w-32' },
      cell: ({ row }) => (
        <div className="space-y-1 text-xs">
          <span className="block">{formatDate(dayOf(row.original))}</span>
          <span className="block break-all">{row.original.invoice_number}</span>
          <StatusBadge
            status={
              row.original.status === 'complete'
                ? 'Complete'
                : row.original.status === 'pending'
                  ? 'Pending'
                  : 'Cancelled'
            }
          />
        </div>
      ),
    },
    {
      id: 'materials',
      header: 'Materials',
      cell: ({ row }) => (
        <span
          className="block truncate"
          title={row.original.items
            .map((item) => item.material_name)
            .join(', ')}
        >
          {row.original.items.map((item) => item.material_name).join(', ')}
        </span>
      ),
    },
    {
      id: 'parties',
      header: 'From → To',
      cell: ({ row }) => (
        <div className="space-y-2 text-xs">
          <div className="flex items-start gap-1 [&>span]:min-w-0 [&>span]:flex-1">
            <Parties row={row.original} />
          </div>
          <Badge variant="outline" className="2xl:hidden">
            <TradeTypeLabel
              type={row.original.type}
              verified={row.original.business_verified}
            />
          </Badge>
        </div>
      ),
    },
    {
      id: 'type',
      header: 'Type',
      meta: { className: 'hidden w-44 2xl:table-cell' },
      cell: ({ row }) => (
        <Badge variant="outline">
          <TradeTypeLabel
            type={row.original.type}
            verified={row.original.business_verified}
          />
        </Badge>
      ),
    },
    {
      id: 'weight',
      header: 'Weight (kg)',
      meta: { align: 'right', className: 'w-28 text-xs' },
      cell: ({ row }) => formatKgNumber(weightOf(row.original) / 1000),
    },
    {
      id: 'amount',
      header: 'Amount',
      meta: { align: 'right', className: 'w-36 text-xs' },
      cell: ({ row }) => formatRand(toCents(row.original.total_price)),
    },
  ];

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
        q,
      },
      {
        onSuccess: () => toast.success('Export downloaded.'),
        onError: (error) => toast.error(errorText(error)),
      }
    );
  }

  return (
    <>
      <PageHeader title={title} description={description} actions={actions} />
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
      <div className="mb-6 space-y-4">
        {!collectionsOnly && (
          <FilterTabs
            label="Transaction status"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'complete', label: 'Complete' },
              { value: 'pending', label: 'Pending' },
            ]}
          />
        )}
        <Toolbar
          label="Search records"
          value={query}
          onChange={setQuery}
          activeFilters={
            Number(!!range?.from) +
            Number(type !== 'all') +
            Number(csv !== 'transaction')
          }
          onClear={() => {
            setRange(undefined);
            setType('all');
            setCsv('transaction');
          }}
          filters={
            <>
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
              {exportKind && !readOnly && (
                <ChoiceSelect
                  label="Export format"
                  value={csv}
                  options={csvOptions(collectionsOnly)}
                  onChange={setCsv}
                  disabled={status !== 'complete'}
                />
              )}
            </>
          }
          action={
            exportKind &&
            !readOnly && (
              <Button
                variant="outline"
                className="h-11 max-lg:w-11 max-lg:px-0"
                aria-label="Export"
                disabled={
                  status !== 'complete' ||
                  download.isPending ||
                  totals.isFetching ||
                  !totals.data?.count ||
                  query.trim() !== q
                }
                onClick={exportCsv}
              >
                <Download data-icon="inline-start" />
                <span className="max-lg:sr-only">Export</span>
              </Button>
            )
          }
        />
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
              : `${title} appear here once one is recorded.`
        }
        skeleton={<RowsSkeleton />}
      >
        <DataTable
          fit
          columns={columns}
          data={shown}
          onRowClick={openRow}
          rowLabel={(row) =>
            row.status === 'pending'
              ? `View request: ${titleOf(row)}`
              : `Invoice and receipts: ${titleOf(row)}`
          }
          renderCard={(row) => (
            <ListRow
              layout="record"
              title={row.items.map((item) => item.material_name).join(', ')}
              secondaryValue={formatKg(weightOf(row) / 1000)}
              subtitle={<Parties row={row} />}
              meta={`${formatDate(dayOf(row))} · ${row.invoice_number}`}
              value={formatRand(toCents(row.total_price))}
              status={
                <>
                  <StatusBadge
                    dotOnly
                    status={
                      row.status === 'complete'
                        ? 'Complete'
                        : row.status === 'pending'
                          ? 'Pending'
                          : 'Cancelled'
                    }
                  />
                  <Badge variant="outline" className="h-5 px-2 text-xs">
                    <TradeTypeLabel
                      compact
                      type={row.type}
                      verified={row.business_verified}
                    />
                  </Badge>
                  {row.status === 'pending' && row.request_id && (
                    <span className="sr-only">
                      <WaitingTag requestId={row.request_id} />
                    </span>
                  )}
                </>
              }
              {...(row.status === 'pending' && row.request_id
                ? {
                    to: '/messages/$requestId' as const,
                    params: { requestId: row.request_id },
                    'aria-label': `View request: ${titleOf(row)}`,
                  }
                : {
                    onOpen: () => openRow(row),
                    'aria-label': `Invoice and receipts: ${titleOf(row)}`,
                  })}
            />
          )}
        />
      </DataState>
      {totals.data !== undefined && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>{plural(totals.data.count, 'record')}</span>
        </div>
      )}
      <Pager pager={pager} page={list.data} total={totals.data?.count} />
    </>
  );
}
