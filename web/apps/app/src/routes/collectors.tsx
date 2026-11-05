import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Guarded } from '@/components/access-guard';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataState, RowsSkeleton } from '@/components/data-state';
import { DataTable } from '@/components/data-table';
import { CollectorDialog } from '@/components/dialogs/collector-dialog';
import { SearchBox } from '@/components/filters';
import { IconButton } from '@/components/icon-button';
import { PageHeader } from '@/components/page-header';
import { PersonAvatar } from '@/components/visuals';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useMockList } from '@/lib/mock/hooks';
import type { Collector } from '@/lib/types';

export const Route = createFileRoute('/collectors')({
  component: () => (
    <Guarded page="collectors">
      <CollectorsPage />
    </Guarded>
  ),
});

function payoutText(collector: Collector): string {
  const { payout } = collector;

  if (payout.method === 'bank') {
    return `Bank · ${payout.bank} ····${payout.accountNumber.slice(-4)}`;
  }

  return `E-wallet · ${payout.walletProvider}`;
}

function CollectorsPage() {
  const list = useMockList('collectors');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Collector | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [removing, setRemoving] = useState<Collector | null>(null);

  const shown = list.items.filter((collector) =>
    `${collector.name} ${collector.phone}`
      .toLowerCase()
      .includes(query.toLowerCase())
  );

  function openForm(collector?: Collector) {
    setEditing(collector);
    setFormOpen(true);
  }

  function actions(collector: Collector) {
    return (
      <div className="flex gap-1">
        <IconButton
          label={`Edit ${collector.name}`}
          onClick={() => openForm(collector)}
        >
          <Pencil />
        </IconButton>
        <IconButton
          label={`Remove ${collector.name}`}
          onClick={() => setRemoving(collector)}
        >
          <Trash2 />
        </IconButton>
      </div>
    );
  }

  const columns: ColumnDef<Collector>[] = [
    {
      accessorKey: 'name',
      header: 'Collector',
      cell: ({ row }) => (
        <span className="flex items-center gap-3">
          <PersonAvatar name={row.original.name} />
          <span className="font-medium">{row.original.name}</span>
        </span>
      ),
    },
    {
      id: 'contact',
      header: 'Contact',
      enableSorting: false,
      cell: ({ row }) => (
        <span>
          <span className="block">{row.original.phone}</span>
          <span className="text-xs text-muted-foreground">
            {row.original.email}
          </span>
        </span>
      ),
    },
    {
      id: 'location',
      header: 'Location',
      enableSorting: false,
      cell: ({ row }) => `${row.original.city}, ${row.original.province}`,
    },
    {
      id: 'payout',
      header: 'Payout details',
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
        title="Your collector network"
        description="The people who bring you material, and how you pay them."
        actions={
          <Button onClick={() => openForm()}>
            <Plus data-icon="inline-start" />
            Add collector
          </Button>
        }
      />
      <div className="mb-6">
        <SearchBox
          label="Search collectors or phone numbers"
          value={query}
          onChange={setQuery}
        />
      </div>
      <DataState
        isEmpty={shown.length === 0}
        icon={Users}
        emptyTitle="No collectors found"
        emptyText="Add the people who collect for you."
        emptyAction={<Button onClick={() => openForm()}>Add collector</Button>}
        skeleton={<RowsSkeleton />}
      >
        <DataTable
          columns={columns}
          data={shown}
          renderCard={(collector) => (
            <Card size="sm">
              <CardContent className="space-y-2">
                <span className="flex items-center gap-3">
                  <PersonAvatar name={collector.name} />
                  <span className="font-medium">{collector.name}</span>
                </span>
                <p className="text-sm text-muted-foreground">
                  {collector.phone} · {collector.city}
                </p>
                <p className="text-sm">{payoutText(collector)}</p>
                {actions(collector)}
              </CardContent>
            </Card>
          )}
          footer={
            <>
              <span>{shown.length} collectors shown</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => toast('That is everyone for now.')}
              >
                Load more
              </Button>
            </>
          }
        />
      </DataState>
      <CollectorDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        collector={editing}
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove ${removing?.name ?? 'collector'}?`}
        description="Their collections stay on record, but they leave your network."
        confirmLabel="Remove collector"
        typedName={removing?.name}
        onConfirm={() => {
          if (removing) list.remove(removing.id);
          setRemoving(null);
          toast.success('Collector removed.');
        }}
      />
    </>
  );
}
