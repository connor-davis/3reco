import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { Boxes, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Guarded } from '@/components/access-guard';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table';
import { DataState, RowsSkeleton } from '@/components/data-state';
import { MaterialDialog } from '@/components/dialogs/material-dialog';
import { SearchBox } from '@/components/filters';
import { IconButton } from '@/components/icon-button';
import { PageHeader } from '@/components/page-header';
import { MaterialThumb } from '@/components/visuals';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatRate } from '@/lib/format';
import { useMock, useMockList } from '@/lib/mock/hooks';
import type { Material } from '@/lib/types';

export const Route = createFileRoute('/materials')({
  component: () => (
    <Guarded page="materials">
      <MaterialsPage />
    </Guarded>
  ),
});

function MaterialsPage() {
  const { role } = useMock();
  const list = useMockList('materials');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Material | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [removing, setRemoving] = useState<Material | null>(null);

  const isAdmin = role === 'admin';
  const shown = list.items.filter((material) =>
    material.name.toLowerCase().includes(query.toLowerCase())
  );

  function openForm(material?: Material) {
    setEditing(material);
    setFormOpen(true);
  }

  function actionsFor(material: Material) {
    if (!isAdmin)
      return <span className="text-sm text-muted-foreground">View only</span>;

    return (
      <div className="flex gap-1">
        <IconButton
          label={`Edit ${material.name}`}
          onClick={() => openForm(material)}
        >
          <Pencil />
        </IconButton>
        <IconButton
          label={`Remove ${material.name}`}
          onClick={() => setRemoving(material)}
        >
          <Trash2 />
        </IconButton>
      </div>
    );
  }

  const columns: ColumnDef<Material>[] = [
    {
      accessorKey: 'name',
      header: 'Material',
      cell: ({ row }) => (
        <span className="flex items-center gap-3">
          <MaterialThumb
            category={row.original.category}
            className="size-9 rounded-lg"
          />
          <span className="font-medium">{row.original.name}</span>
        </span>
      ),
    },
    {
      accessorKey: 'carbonFactor',
      header: 'Carbon factor (kg CO₂ / kg)',
      enableSorting: false,
    },
    { accessorKey: 'gwCode', header: 'GW code', enableSorting: false },
    {
      accessorKey: 'referencePrice',
      header: 'Reference price',
      cell: ({ row }) => formatRate(row.original.referencePrice),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => actionsFor(row.original),
    },
  ];

  return (
    <>
      <PageHeader
        title="Material catalogue"
        description="The grades, rates and carbon factors behind every trade."
        actions={
          isAdmin && (
            <Button onClick={() => openForm()}>
              <Plus data-icon="inline-start" />
              Add material
            </Button>
          )
        }
      />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <SearchBox
          label="Search material names"
          value={query}
          onChange={setQuery}
        />
        {!isAdmin && <Badge variant="outline">Read-only catalogue</Badge>}
      </div>
      <DataState
        isEmpty={shown.length === 0}
        icon={Boxes}
        emptyTitle="No material matches"
        emptyText="Try a different name."
        skeleton={<RowsSkeleton />}
      >
        <DataTable
          columns={columns}
          data={shown}
          renderCard={(material) => (
            <Card size="sm">
              <CardContent className="space-y-2">
                <p className="font-medium">{material.name}</p>
                <p className="text-sm text-muted-foreground">
                  {material.carbonFactor} kg CO₂ / kg · {material.gwCode}
                </p>
                <p className="text-sm">{formatRate(material.referencePrice)}</p>
                {actionsFor(material)}
              </CardContent>
            </Card>
          )}
          footer={
            <>
              <span>{shown.length} material grades</span>
              <span>Carbon factors apply per kg traded</span>
            </>
          }
        />
      </DataState>
      <MaterialDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        material={editing}
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove ${removing?.name ?? 'material'}?`}
        description="It leaves the catalogue. Existing trades keep their records."
        confirmLabel="Remove material"
        onConfirm={() => {
          if (removing) list.remove(removing.id);
          setRemoving(null);
          toast.success('Material removed.');
        }}
      />
    </>
  );
}
