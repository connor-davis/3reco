import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { History } from 'lucide-react';
import { Guarded } from '@/components/access-guard';
import { DataState } from '@/components/data-state';
import { DataTable } from '@/components/data-table';
import { ChoiceSelect } from '@/components/filters';
import { ListRow } from '@/components/list-row';
import { PageHeader } from '@/components/page-header';
import { ResponsiveOverlay } from '@/components/responsive-overlay';
import { Toolbar } from '@/components/toolbar';
import { Input } from '@/components/ui/input';
import { Pager } from '@/components/transactions/list-tools';
import { usePager } from '@/components/transactions/pager-state';
import { useActivity } from '@/lib/api/admin';
import type { ActivityLine } from '@/lib/api/types';
import { eventLabel } from '@/lib/privacy-labels';
import type { PrivacyEvent } from '@/lib/api/types';
import { formatDateTime } from '@/lib/format';
import { useDebounced } from '@/lib/use-debounced';
import { roleLabel } from '@/lib/access';

export const Route = createFileRoute('/admin/activity')({
  component: () => (
    <Guarded page="activity">
      <ActivityPage />
    </Guarded>
  ),
});

const tableNames: Record<string, string> = {
  users: 'User',
  collectors: 'Collector',
  materials: 'Material',
  stock: 'Stock',
  transactions: 'Transaction',
  transaction_items: 'Transaction item',
  transaction_receipts: 'Receipt',
  transaction_requests: 'Request',
  transaction_request_items: 'Request item',
  transaction_request_messages: 'Message',
  store_reviews: 'Review',
  privacy_notice_acceptances: 'Privacy notice',
  privacy_events: 'Privacy event',
};
const tableOptions = [
  { value: 'all', label: 'All records' },
  ...Object.entries(tableNames).map(([value, label]) => ({ value, label })),
];
const actionOptions = [
  { value: 'all', label: 'Any change' },
  { value: 'insert', label: 'Added' },
  { value: 'update', label: 'Edited' },
  { value: 'delete', label: 'Removed' },
];
const verbs: Record<string, string> = {
  insert: 'added',
  update: 'edited',
  delete: 'removed',
};

const tableLabel = (table: string) => tableNames[table] ?? table;
const whatText = (line: ActivityLine) =>
  line.source === 'privacy'
    ? eventLabel({
        kind: line.action,
        details: (line.new_values ?? {}) as PrivacyEvent['details'],
      })
    : `${tableLabel(line.table)} · ${verbs[line.action] ?? line.action.replaceAll('_', ' ')}`;
function partyText(name: string | null, role: string | null) {
  return `${name ?? 'Unknown'}${role ? ` · ${roleLabel(role)}` : ''}`;
}
const whoText = (line: ActivityLine) =>
  line.source === 'privacy'
    ? partyText(line.actor_name, line.actor_role)
    : (line.actor_name ?? 'System');
const show = (value: unknown) =>
  value === null || value === undefined
    ? 'empty'
    : typeof value === 'object'
      ? JSON.stringify(value)
      : String(value);

/** "field: old → new" for each changed field; added and removed rows list their fields. */
function changes(line: ActivityLine): string[] {
  const after = line.new_values ?? {};
  const before = line.old_values ?? {};

  return Object.keys({ ...before, ...after }).map((key) => {
    const name = key.replaceAll('_', ' ');
    if (line.action === 'update')
      return `${name}: ${show(before[key])} → ${show(after[key])}`;
    return `${name}: ${show(line.action === 'delete' ? before[key] : after[key])}`;
  });
}

function recordText(line: ActivityLine) {
  if (line.source === 'privacy') {
    if (line.row_key?.subject_id) return partyText(line.subject_name, null);
    return line.action === 'export'
      ? 'Many people (data download)'
      : 'No individual subject';
  }

  const key = Object.values(line.row_key ?? {})
    .map(String)
    .join(' · ');
  return line.subject_name ? `${line.subject_name} (${key})` : key;
}

function ChangeList({ line }: { line: ActivityLine }) {
  const list = changes(line);
  if (list.length === 0)
    return <span className="text-muted-foreground">No details</span>;

  return (
    <ul className="space-y-1 text-sm">
      {list.map((item) => (
        <li key={item} className="break-words">
          {item}
        </li>
      ))}
    </ul>
  );
}

function ActivityPage() {
  const [search, setSearch] = useState('');
  const [table, setTable] = useState('all');
  const [action, setAction] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [open, setOpen] = useState<ActivityLine | null>(null);
  const q = useDebounced(search.trim(), 150);
  const pager = usePager({
    q,
    table: table === 'all' ? undefined : table,
    action: action === 'all' ? undefined : action,
    from: from || undefined,
    to: to || undefined,
  });
  const list = useActivity(pager.params);
  const shown = list.data?.items ?? [];
  const active =
    Number(table !== 'all') +
    Number(action !== 'all') +
    Number(!!from) +
    Number(!!to);

  const columns: ColumnDef<ActivityLine>[] = [
    {
      id: 'at',
      header: 'When',
      enableSorting: false,
      cell: ({ row }) => formatDateTime(row.original.at),
    },
    {
      id: 'who',
      header: 'Who',
      enableSorting: false,
      cell: ({ row }) => whoText(row.original),
    },
    {
      id: 'what',
      header: 'What',
      enableSorting: false,
      meta: { main: true },
      cell: ({ row }) => (
        <button
          type="button"
          className="cursor-pointer text-left font-medium hover:underline"
          onClick={() => setOpen(row.original)}
        >
          {whatText(row.original)}
        </button>
      ),
    },
    {
      id: 'record',
      header: 'Record',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="block max-w-48 truncate">
          {recordText(row.original)}
        </span>
      ),
    },
    {
      id: 'changes',
      header: 'Changes',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="line-clamp-2 max-w-md text-sm text-muted-foreground">
          {changes(row.original).join(' · ')}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Activity log"
        description="Every change to business data, and who made it. Kept for 5 years."
      />
      <div className="space-y-6">
        <Toolbar
          label="Search by person"
          value={search}
          onChange={setSearch}
          activeFilters={active}
          onClear={() => {
            setTable('all');
            setAction('all');
            setFrom('');
            setTo('');
          }}
          filters={
            <>
              <ChoiceSelect
                label="Record"
                value={table}
                options={tableOptions}
                onChange={setTable}
              />
              <ChoiceSelect
                label="Change"
                value={action}
                options={actionOptions}
                onChange={setAction}
              />
              <Input
                type="date"
                aria-label="From date"
                value={from}
                max={to || undefined}
                onChange={(e) => setFrom(e.target.value)}
                className="min-h-11 w-40"
              />
              <Input
                type="date"
                aria-label="To date"
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
                className="min-h-11 w-40"
              />
            </>
          }
        />
        <DataState
          query={list}
          isEmpty={shown.length === 0}
          icon={History}
          emptyTitle="Nothing logged"
          emptyText="Try other dates or filters."
        >
          <DataTable
            columns={columns}
            data={shown}
            renderCard={(line) => (
              <ListRow
                title={whatText(line)}
                subtitle={`${whoText(line)} · ${formatDateTime(line.at)}`}
                meta={recordText(line)}
                onOpen={() => setOpen(line)}
              />
            )}
          />
        </DataState>
        <Pager pager={pager} page={list.data} />
      </div>
      <ResponsiveOverlay
        open={open !== null}
        onOpenChange={(next) => !next && setOpen(null)}
        title={open ? whatText(open) : 'Change'}
        description={
          open ? `${whoText(open)} · ${formatDateTime(open.at)}` : 'Change'
        }
      >
        {open && <ChangeList line={open} />}
      </ResponsiveOverlay>
    </>
  );
}
