import { useState } from 'react';
import { useDebounced } from '@/lib/use-debounced';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, ShieldCheck, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Guarded } from '@/components/access-guard';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataState, RowsSkeleton } from '@/components/data-state';
import { DataTable } from '@/components/data-table';
import { CollectorDialog } from '@/components/dialogs/collector-dialog';
import { Toolbar } from '@/components/toolbar';
import { RowActions } from '@/components/row-actions';
import { PageHeader } from '@/components/page-header';
import { Pager } from '@/components/transactions/list-tools';
import { errorText, usePager } from '@/components/transactions/pager-state';
import { PersonAvatar } from '@/components/visuals';
import { Button } from '@/components/ui/button';
import { ListRow } from '@/components/list-row';
import {
  useCollector,
  useCollectors,
  useDeleteCollector,
} from '@/lib/api/collectors';
import type { Collector } from '@/lib/api/types';
import { useAuth } from '@/lib/auth/use-auth';
import { isStaffRole } from '@/lib/access';
import { formatPhone } from '@/lib/format';

export const Route = createFileRoute('/collectors')({
  component: () => (
    <Guarded page="collectors">
      <CollectorsPage />
    </Guarded>
  ),
});

function payoutText(collector: Collector): string {
  if (collector.payout_method === 'bank') {
    // The server already sends only the last four digits.
    const account = collector.bank_account_number ?? '';

    return `Bank · ${collector.bank_name ?? ''} ${account}`.trim();
  }

  if (collector.payout_method === 'ewallet') {
    return `E-wallet · ${collector.ewallet_platform_name ?? ''}`.trim();
  }

  // Empty and hidden look the same in the data, so the server says which.
  return collector.can_view_payout || collector.can_edit
    ? 'None added'
    : 'Not shared';
}

type RemoveProps = { collector: Collector | null; onClose: () => void };

function RemoveCollector({ collector, onClose }: RemoveProps) {
  const remove = useDeleteCollector(collector?.id ?? '');
  // The API asks for the collector's email, or their phone when there is none.
  const confirmation = collector?.email || collector?.phone || '';

  return (
    <ConfirmDialog
      open={collector !== null}
      onOpenChange={(open) => !open && onClose()}
      title={`Remove ${collector?.name ?? 'collector'}?`}
      description="Their collections stay on record, but they leave the directory."
      confirmLabel="Remove collector"
      typedName={confirmation}
      onConfirm={() => {
        remove.mutate(
          { confirmation_value: confirmation },
          {
            onSuccess: () => toast.success('Collector removed.'),
            onError: (error) => toast.error(errorText(error)),
          }
        );
        onClose();
      }}
    />
  );
}

function CollectorsPage() {
  const { user } = useAuth();
  // Admin and staff see everyone's collectors, so the page is not "yours".
  const directory = isStaffRole(user?.role);
  const isBusiness = user?.role === 'business';
  const verified = isBusiness && user?.business_verified === true;
  const [query, setQuery] = useState('');
  const [desc, setDesc] = useState(false);
  const pager = usePager({
    q: useDebounced(query.trim(), 150),
    order: desc ? 'desc' : undefined,
  });
  const list = useCollectors(pager.params);
  const [editing, setEditing] = useState<Collector | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [removing, setRemoving] = useState<Collector | null>(null);
  // The list never carries the full payout number. The edit form asks for the
  // one collector, and the server sends the full value only to those allowed.
  const detail = useCollector(formOpen && editing ? editing.id : '');

  // Only admin and staff may remove a collector. Businesses add and edit.
  const canRemove = user?.role === 'admin' || user?.role === 'staff';
  const shown = list.data?.items ?? [];
  const searching = query.trim() !== '';
  // The API adds `total`; until it does, no total is shown rather than a guess.
  const rawTotal = (list.data as { total?: unknown } | undefined)?.total;
  const total = typeof rawTotal === 'number' ? rawTotal : undefined;

  function openForm(collector?: Collector) {
    setEditing(collector);
    setFormOpen(true);
  }

  function actions(collector: Collector) {
    return (
      <RowActions
        name={collector.name}
        actions={[
          ...(collector.can_edit
            ? [{ label: 'Edit', onSelect: () => openForm(collector) }]
            : []),
          ...(canRemove
            ? [
                {
                  label: 'Remove',
                  destructive: true,
                  onSelect: () => setRemoving(collector),
                },
              ]
            : []),
        ]}
      />
    );
  }

  const columns: ColumnDef<Collector>[] = [
    {
      accessorKey: 'name',
      header: 'Collector',
      // The server sorts the whole list by name, so the header is a button.
      enableSorting: true,
      meta: { main: true },
      cell: ({ row }) => (
        <span className="flex min-w-0 items-center gap-3">
          <PersonAvatar name={row.original.name} className="size-8" />
          <span className="min-w-0">
            <span className="block truncate font-medium">
              {row.original.name}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {row.original.email || 'No email'}
            </span>
          </span>
        </span>
      ),
    },
    {
      id: 'phone',
      header: 'Phone',
      enableSorting: false,
      cell: ({ row }) =>
        row.original.phone ? formatPhone(row.original.phone) : 'Not shared',
    },
    {
      id: 'location',
      header: 'Location',
      enableSorting: false,
      cell: ({ row }) => `${row.original.city}, ${row.original.province}`,
    },
    {
      id: 'payout',
      header: 'Payout',
      enableSorting: false,
      cell: ({ row }) => payoutText(row.original),
    },
    {
      id: 'actions',
      header: 'Actions',
      enableSorting: false,
      cell: ({ row }) => actions(row.original),
    },
  ];

  return (
    <>
      <PageHeader
        title="Collector directory"
        badge={
          verified && (
            <Badge variant="secondary">
              <ShieldCheck data-icon="inline-start" />
              Verified business
            </Badge>
          )
        }
        actions={
          !directory && (
            <Button aria-label="Add collector" onClick={() => openForm()}>
              <Plus data-icon="inline-start" />
              Add collector
            </Button>
          )
        }
        description={
          directory
            ? 'Every collector on 3REco, and how they are paid.'
            : verified
              ? 'Every collector on 3REco. Your business is verified, so you can see and edit them all.'
              : 'A shared directory of collectors. You can edit the ones you added.' +
                (isBusiness
                  ? ' Ask an admin to verify your business to see and edit every collector.'
                  : '')
        }
      />
      <div className="mb-6 space-y-4">
        <Toolbar
          label="Search by name, email or phone"
          value={query}
          onChange={setQuery}
        />
      </div>
      <DataState
        query={list}
        isEmpty={shown.length === 0}
        icon={Users}
        emptyTitle={
          searching ? 'No matching collectors' : 'No collectors found'
        }
        emptyText={
          searching
            ? 'Try a different name, email or phone.'
            : directory
              ? 'No collectors on 3REco yet.'
              : 'The shared directory is empty. Add the people who collect for you.'
        }
        emptyAction={
          searching ? (
            <Button variant="outline" onClick={() => setQuery('')}>
              Clear search
            </Button>
          ) : (
            !directory && (
              <Button onClick={() => openForm()}>Add collector</Button>
            )
          )
        }
        skeleton={<RowsSkeleton />}
      >
        <DataTable
          columns={columns}
          data={shown}
          serverSort={{ id: 'name', desc, onChange: setDesc }}
          renderCard={(collector) => (
            <ListRow
              media={<PersonAvatar name={collector.name} className="size-10" />}
              title={collector.name}
              subtitle={
                [
                  collector.phone && formatPhone(collector.phone),
                  collector.email,
                  collector.city,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'Not shared'
              }
              meta={`Payout: ${payoutText(collector)}`}
              onOpen={
                collector.can_edit ? () => openForm(collector) : undefined
              }
              actions={[
                ...(collector.can_edit
                  ? [
                      {
                        label: 'Edit',
                        onSelect: () => openForm(collector),
                      },
                    ]
                  : []),
                ...(canRemove
                  ? [
                      {
                        label: 'Remove',
                        onSelect: () => setRemoving(collector),
                        destructive: true,
                      },
                    ]
                  : []),
              ]}
            />
          )}
          footer={<span>{desc ? 'Sorted Z to A' : 'Sorted A to Z'}</span>}
        />
      </DataState>
      <Pager pager={pager} page={list.data} total={total} />
      <CollectorDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        collector={detail.data ?? editing}
      />
      <RemoveCollector collector={removing} onClose={() => setRemoving(null)} />
    </>
  );
}
