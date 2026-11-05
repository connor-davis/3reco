import { useState, type ReactNode } from 'react';
import type { DateRange } from 'react-day-picker';
import { Boxes, Download, FileText, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { DataState, RowsSkeleton } from '@/components/data-state';
import { TransactionDialog } from '@/components/dialogs/record-dialogs';
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
import { useTransactions } from '@/lib/api/transactions';
import type { Transaction } from '@/lib/api/types';
import {
  formatDate,
  formatKg,
  formatRand,
  formatRate,
  toCents,
  toGrams,
} from '@/lib/format';

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
  { value: 'b2b', label: 'B2B' },
  { value: 'c2b', label: 'C2B' },
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
  const pager = usePager();
  const list = useTransactions(kind, pager.params);
  const download = useExport(exportKind ?? 'transactions');
  const [query, setQuery] = useState('');
  const [range, setRange] = useState<DateRange | undefined>();
  const [type, setType] = useState('all');
  const [csv, setCsv] = useState('transaction');
  const [open, setOpen] = useState<Transaction | null>(null);

  const rows = (list.data?.items ?? []).filter(
    (row) => !collectionsOnly || row.type === 'c2b'
  );
  const shown = rows.filter((row) => {
    if (type !== 'all' && row.type !== type) return false;

    const day = new Date(dayOf(row));
    if (range?.from && day < range.from) return false;
    if (range?.to && day > range.to) return false;

    const text = `${row.id} ${row.invoice_number} ${row.seller.name} ${row.buyer.name} ${row.items
      .map((item) => item.material_name)
      .join(' ')}`;

    return text.toLowerCase().includes(query.toLowerCase());
  });

  const totalCents = shown.reduce(
    (sum, row) => sum + toCents(row.total_price),
    0
  );
  const totalGrams = shown.reduce((sum, row) => sum + weightOf(row), 0);

  function exportCsv() {
    // The export routes want full timestamps, covering the whole last day.
    const to = range?.to && new Date(range.to);
    to?.setHours(23, 59, 59, 999);

    download.mutate(
      {
        from: range?.from?.toISOString(),
        to: to?.toISOString(),
        itemised: csv === 'material',
      },
      { onError: (error) => toast.error(errorText(error)) }
    );
  }

  return (
    <>
      <PageHeader title={title} description={description} actions={actions} />
      {stats && (
        <div className="mb-6">
          <StatGrid>
            <StatCard
              label="Collection value"
              value={formatRand(totalCents)}
              icon={Receipt}
            />
            <StatCard
              label="Material weight"
              value={formatKg(totalGrams / 1000)}
              icon={Boxes}
            />
            <StatCard
              label="Collections"
              value={String(shown.length)}
              icon={FileText}
            />
          </StatGrid>
        </div>
      )}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <SearchBox label="Search records" value={query} onChange={setQuery} />
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
          <>
            <ChoiceSelect
              label="Export format"
              value={csv}
              options={csvOptions}
              onChange={setCsv}
            />
            <Button
              variant="outline"
              disabled={download.isPending}
              onClick={exportCsv}
            >
              <Download data-icon="inline-start" />
              Export
            </Button>
          </>
        )}
      </div>
      <DataState
        query={list}
        isEmpty={shown.length === 0}
        icon={Receipt}
        emptyTitle={rows.length === 0 ? emptyTitle : 'No matching records'}
        emptyText={
          rows.length === 0
            ? 'They appear here once a deal is recorded.'
            : 'Try other dates or words.'
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
                <Badge variant="outline">{row.type.toUpperCase()}</Badge>
                <span className="w-28 text-right font-semibold tabular-nums">
                  {formatRand(toCents(row.total_price))}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setOpen(row)}
                >
                  Details
                  {!readOnly && ` (${row.receipts.length} receipts)`}
                </Button>
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      </DataState>
      <Pager pager={pager} page={list.data} />
      <TransactionDialog
        key={open?.id}
        record={open}
        readOnly={readOnly}
        onClose={() => setOpen(null)}
      />
    </>
  );
}
