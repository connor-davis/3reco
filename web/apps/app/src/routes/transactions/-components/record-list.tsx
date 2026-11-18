import { useEffect, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useSearch } from '@tanstack/react-router';
import { format } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { Boxes, Download, FileText, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { DataState, RowsSkeleton } from '@/components/data-state';
import { DataTable } from '@/components/data-table';
import type { ColumnDef } from '@tanstack/react-table';
import { TradeParties, StatusBadge, TradeTypeLabel } from '@/components/badges';
import { ListRow } from '@/components/list-row';
import {
  BusinessPicker,
  type BusinessOption,
} from '@/components/business-picker';
import { RowActions } from '@/components/row-actions';
import { ChoiceSelect, FilterTabs } from '@/components/filters';
import { Toolbar } from '@/components/toolbar';
import { PageHeader } from '@/components/page-header';
import { StatCard, StatGrid } from '@/components/stat-card';
import { Pager } from '@/components/transactions/list-tools';
import { errorText, usePager } from '@/components/transactions/pager-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { useAppConfig } from '@/lib/api/app-config';
import { useExport, type ExportKind } from '@/lib/api/exports';
import { useRequest } from '@/lib/api/requests';
import {
  useDownloadInvoice,
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
  formatKgNumber,
  formatRand,
  toCents,
  toGrams,
} from '@/lib/format';
import { tradeTypeLabel } from '@/lib/trade-type';
import { FilterField } from '@/components/toolbar';

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
  businessPicker?: boolean;
  actions?: ReactNode;
  // A lone "..." menu sits beside the title on a phone instead of on its own row.
  actionsBeside?: boolean;
  // Collections show a stats row. Other pages skip it.
  stats?: boolean;
  readOnly?: boolean;
  businessFilter?: 'all' | 'bought' | 'sold';
  onBusinessFilterChange?: (filter: string) => void;
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
  return <TradeParties seller={row.seller} buyer={row.buyer} />;
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

  return <StatusBadge status={waitingFor(request.data, user?.id)} />;
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
  businessPicker = false,
  actions,
  actionsBeside = false,
  stats = false,
  readOnly = false,
  businessFilter,
  onBusinessFilterChange,
}: Props) {
  const { user } = useAuth();
  const staff = user?.role === 'admin' || user?.role === 'staff';
  const chooseBusiness = businessPicker && staff;
  const [selectedBusiness, setSelectedBusiness] =
    useState<BusinessOption | null>(null);
  const direction = (row: Transaction) =>
    row.buyer.id === user?.active_business_id ? 'Bought' : 'Sold';
  const [status, setStatus] = useState('complete');
  const [query, setQuery] = useState('');
  const [range, setRange] = useState<DateRange | undefined>();
  const [type, setType] = useState('all');
  const [csv, setCsv] = useState('transaction');
  const invoice = useDownloadInvoice();

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

  function downloadInvoice(row: Transaction) {
    invoice.mutate(row, {
      onError: (error) => toast.error(errorText(error)),
    });
  }

  const columns: ColumnDef<Transaction>[] = [
    {
      id: 'date',
      header: 'Date / Invoice',
      meta: { className: 'max-xl:px-2' },
      cell: ({ row }) => (
        <div>
          <span className="block">{formatDate(dayOf(row.original))}</span>
          <span className="block text-xs text-muted-foreground">
            {row.original.invoice_number}
          </span>
        </div>
      ),
    },
    {
      id: 'materials',
      header: 'Materials',
      meta: {
        main: true,
        className: 'w-1/2 min-w-28 whitespace-normal max-xl:px-2 xl:min-w-32',
      },
      cell: ({ row }) => (
        <span
          className="block break-words"
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
      meta: {
        main: true,
        className: 'w-1/2 min-w-48 whitespace-normal max-xl:px-2 xl:min-w-64',
      },
      cell: ({ row }) => (
        <div className="space-y-1 whitespace-normal">
          <Parties row={row.original} />
          {businessFilter && (
            <Badge variant="secondary">{direction(row.original)}</Badge>
          )}
          {collectionsOnly && (
            <Badge variant="outline" className="h-5 px-2 text-xs">
              <TradeTypeLabel
                compact
                type={row.original.type}
                verified={row.original.business_verified}
              />
            </Badge>
          )}
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      meta: { className: 'max-xl:px-2' },
      cell: ({ row }) => (
        <StatusBadge
          status={
            row.original.status === 'complete'
              ? 'Complete'
              : row.original.status === 'pending'
                ? 'Pending'
                : row.original.status === 'duplicate'
                  ? 'Duplicate'
                  : 'Cancelled'
          }
        />
      ),
    },
    {
      id: 'weight',
      header: 'Weight (kg)',
      meta: { align: 'right', className: 'max-xl:px-2' },
      cell: ({ row }) => formatKgNumber(weightOf(row.original) / 1000),
    },
    {
      id: 'amount',
      header: 'Amount',
      meta: { align: 'right', className: 'max-xl:px-2' },
      cell: ({ row }) => formatRand(toCents(row.original.total_price)),
    },
    {
      id: 'actions',
      header: 'Actions',
      meta: { className: 'max-xl:px-2' },
      enableSorting: false,
      cell: ({ row }) => (
        <RowActions
          name={row.original.invoice_number}
          actions={[
            { label: 'Open', onSelect: () => openRow(row.original) },
            ...(row.original.status === 'complete'
              ? [
                  {
                    label: 'Download invoice',
                    disabled: invoice.isPending,
                    onSelect: () => downloadInvoice(row.original),
                  },
                ]
              : []),
          ]}
        />
      ),
    },
  ];

  // The server does the searching, so the filters ride along with every page.
  const q = useDebounced(query.trim());
  const filters = {
    business_id: chooseBusiness ? selectedBusiness?.value : undefined,
    status: collectionsOnly ? 'complete' : status,
    q,
    // Collections are always c2b; the server filters, not this page.
    type: collectionsOnly ? 'c2b' : type === 'all' ? undefined : type,
    from: range?.from && day(range.from),
    to: range?.to && day(range.to),
  };
  // Each direction has its own cursor scope even when other filters match.
  const pager = usePager({ ...filters, kind });
  const list = useTransactions(kind, pager.params);
  const totals = useTransactionTotals(kind, filters);
  const download = useExport(exportKind ?? 'transactions');
  // The demo has no downloads at all.
  const { demo } = useAppConfig();
  // Hidden when it can never run; only greyed while totals reload or a search settles,
  // so the button doesn't blink in and out as you type.
  const canExport =
    !!exportKind &&
    (collectionsOnly || kind !== 'mine' || staff) &&
    !readOnly &&
    !demo &&
    status === 'complete' &&
    !!totals.data?.count;
  const exportBusy =
    download.isPending || totals.isFetching || query.trim() !== q;

  const shown = list.data?.items ?? [];
  const filtered = !!(
    q ||
    filters.business_id ||
    range?.from ||
    (!collectionsOnly && type !== 'all')
  );
  const caption = !filtered
    ? 'All time'
    : range?.from && !q && !filters.business_id && type === 'all'
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
        business_id: filters.business_id,
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
      <PageHeader
        title={title}
        description={description}
        actions={actions}
        compactActionsBelow={!actionsBeside}
      />
      {stats && (
        <div className="mb-8">
          <StatGrid threeUp>
            <StatCard
              tint="mint"
              label="Collection value"
              value={formatRand(toCents(totals.data?.value ?? '0'))}
              hint={caption}
              icon={Receipt}
              isLoading={totals.isLoading}
              unavailable={totals.isError}
            />
            <StatCard
              tint="peach"
              label="Material weight"
              value={formatKg(totals.data?.weight ?? '0')}
              hint={caption}
              icon={Boxes}
              isLoading={totals.isLoading}
              unavailable={totals.isError}
            />
            <StatCard
              tint="lilac"
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
        {businessFilter && onBusinessFilterChange && (
          <FilterTabs
            label="Bought or sold"
            value={businessFilter}
            onChange={onBusinessFilterChange}
            options={[
              { value: 'all', label: 'All' },
              { value: 'bought', label: 'Bought' },
              { value: 'sold', label: 'Sold' },
            ]}
          />
        )}
        <Toolbar
          sheetOnDesktop
          label="Search records"
          value={query}
          onChange={setQuery}
          activeFilters={
            Number(!!range?.from) +
            Number(!!filters.business_id) +
            Number(type !== 'all') +
            Number(csv !== 'transaction') +
            Number(!collectionsOnly && status !== 'complete')
          }
          onClear={() => {
            setRange(undefined);
            setSelectedBusiness(null);
            setType('all');
            setCsv('transaction');
            setStatus('complete');
          }}
          filters={
            <>
              {!collectionsOnly && (
                <FilterField label="Status">
                  <ChoiceSelect
                    label="Transaction status"
                    className="w-full"
                    value={status}
                    onChange={setStatus}
                    options={[
                      { value: 'complete', label: 'Complete' },
                      { value: 'pending', label: 'Pending' },
                    ]}
                  />
                </FilterField>
              )}
              <FilterField label="Dates">
                <DateRangePicker
                  value={range}
                  onChange={setRange}
                  placeholder="From – to date"
                  align="start"
                />
              </FilterField>
              {typeFilter && (
                <FilterField label="Type">
                  <ChoiceSelect
                    label="Transaction type"
                    className="w-full"
                    value={type}
                    options={typeOptions}
                    onChange={setType}
                  />
                </FilterField>
              )}
              {chooseBusiness && (
                <FilterField label="Business">
                  <BusinessPicker
                    value={selectedBusiness}
                    onChange={setSelectedBusiness}
                  />
                </FilterField>
              )}
              {canExport && (
                <FilterField label="Export format">
                  <ChoiceSelect
                    label="Export format"
                    className="w-full"
                    value={csv}
                    options={csvOptions(collectionsOnly)}
                    onChange={setCsv}
                  />
                </FilterField>
              )}
            </>
          }
          action={
            canExport && (
              <Button
                variant="outline"
                className="h-11 max-lg:w-11 max-lg:px-0 max-lg:has-data-[icon=inline-start]:pl-0"
                aria-label="Export"
                disabled={exportBusy}
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
              title={`${businessFilter ? `${direction(row)} · ` : ''}${row.items.map((item) => item.material_name).join(', ')}`}
              secondaryValue={formatKg(weightOf(row) / 1000)}
              subtitle={<Parties row={row} />}
              meta={`${formatDate(dayOf(row))} · ${row.invoice_number}`}
              value={formatRand(toCents(row.total_price))}
              trailing={
                row.status === 'complete' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="min-h-11 min-w-11"
                    aria-label={`Download invoice ${row.invoice_number}`}
                    disabled={invoice.isPending}
                    onClick={() => downloadInvoice(row)}
                  >
                    <Download aria-hidden="true" />
                  </Button>
                )
              }
              status={
                <>
                  <StatusBadge
                    dotOnly
                    status={
                      row.status === 'complete'
                        ? 'Complete'
                        : row.status === 'pending'
                          ? 'Pending'
                          : row.status === 'duplicate'
                            ? 'Duplicate'
                            : 'Cancelled'
                    }
                  />
                  {collectionsOnly && (
                    <Badge variant="outline" className="h-5 px-2 text-xs">
                      <TradeTypeLabel
                        compact
                        type={row.type}
                        verified={row.business_verified}
                      />
                    </Badge>
                  )}
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
      <Pager pager={pager} page={list.data} total={totals.data?.count} />
    </>
  );
}
