import { useState, type ReactNode } from 'react';
import type { DateRange } from 'react-day-picker';
import {
  Boxes,
  Download,
  Eye,
  FileText,
  Receipt,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { StatusBadge } from '@/components/badges';
import { DataState, RowsSkeleton } from '@/components/data-state';
import {
  InvoiceDialog,
  PartyDialog,
  ReceiptDialog,
} from '@/components/dialogs/record-dialogs';
import { ChoiceSelect, SearchBox } from '@/components/filters';
import { IconButton } from '@/components/icon-button';
import { PageHeader } from '@/components/page-header';
import { StatCard, StatGrid } from '@/components/stat-card';
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
import { materialById } from '@/lib/data/materials';
import {
  formatDate,
  formatKg,
  formatRand,
  formatRate,
  lineCents,
  toGrams,
} from '@/lib/format';
import type { Transaction } from '@/lib/types';

type Props = {
  title: string;
  description: string;
  rows: Transaction[];
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
  { value: 'B2B', label: 'B2B' },
  { value: 'C2B', label: 'C2B' },
];

const csvOptions = [
  { value: 'transaction', label: 'Transaction CSV' },
  { value: 'material', label: 'Material CSV' },
];

/** The shared record list: filters, optional stats, rows and their dialogs. */
export function RecordList({
  title,
  description,
  rows,
  emptyTitle,
  typeFilter = false,
  actions,
  stats = false,
  readOnly = false,
}: Props) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [csv, setCsv] = useState('transaction');
  const [range, setRange] = useState<DateRange | undefined>();
  const [receipt, setReceipt] = useState<Transaction | null>(null);
  const [invoice, setInvoice] = useState<Transaction | null>(null);
  const [party, setParty] = useState<Transaction | null>(null);

  const shown = rows.filter((row) => {
    if (type !== 'all' && row.type !== type) return false;

    const day = new Date(row.date);
    if (range?.from && day < range.from) return false;
    if (range?.to && day > range.to) return false;

    const text = `${row.id} ${row.seller} ${row.buyer} ${materialById(row.materialId).name}`;

    return text.toLowerCase().includes(query.toLowerCase());
  });

  const totalCents = shown.reduce(
    (sum, row) => sum + lineCents(row.pricePerKg, row.kg),
    0
  );
  const totalGrams = shown.reduce((sum, row) => sum + toGrams(row.kg), 0);

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
        <ChoiceSelect
          label="Export format"
          value={csv}
          options={csvOptions}
          onChange={setCsv}
        />
        <Button
          variant="outline"
          onClick={() => toast('Exports are coming soon.')}
        >
          <Download data-icon="inline-start" />
          Export
        </Button>
      </div>
      <DataState
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
                <ItemTitle>
                  {materialById(row.materialId).name} · {formatKg(row.kg)}
                </ItemTitle>
                <ItemDescription>
                  {row.seller} → {row.buyer}
                </ItemDescription>
                <p className="text-xs text-muted-foreground">
                  {formatDate(row.date)} · {formatRate(row.pricePerKg)} ·{' '}
                  {row.id}
                </p>
              </ItemContent>
              <ItemActions className="flex-wrap">
                <Badge variant="outline">{row.type}</Badge>
                <StatusBadge status={row.status} />
                <span className="w-28 text-right font-semibold tabular-nums">
                  {formatRand(lineCents(row.pricePerKg, row.kg))}
                </span>
                <IconButton
                  label={`Party details for ${row.id}`}
                  onClick={() => setParty(row)}
                >
                  <UserRound />
                </IconButton>
                {row.receipts > 0 && (
                  <IconButton
                    label={`Receipts for ${row.id} (${row.receipts})`}
                    onClick={() => setReceipt(row)}
                  >
                    <Eye />
                  </IconButton>
                )}
                {!readOnly && row.invoiceNo && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setInvoice(row)}
                  >
                    Invoice
                  </Button>
                )}
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      </DataState>
      <ReceiptDialog
        key={receipt?.id}
        record={receipt}
        onClose={() => setReceipt(null)}
      />
      <InvoiceDialog record={invoice} onClose={() => setInvoice(null)} />
      <PartyDialog record={party} onClose={() => setParty(null)} />
    </>
  );
}
