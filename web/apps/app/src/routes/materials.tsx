import { useState } from 'react';
import { useDebounced } from '@/lib/use-debounced';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { Boxes, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Guarded } from '@/components/access-guard';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table';
import { DataState, RowsSkeleton } from '@/components/data-state';
import { MaterialDialog } from '@/components/dialogs/material-dialog';
import { Toolbar } from '@/components/toolbar';
import { IconButton } from '@/components/icon-button';
import { PageHeader } from '@/components/page-header';
import { MaterialMark, Pager } from '@/components/transactions/list-tools';
import { errorText, usePager } from '@/components/transactions/pager-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ListRow } from '@/components/list-row';
import { useDeleteMaterial, useMaterials } from '@/lib/api/materials';
import type { Material } from '@/lib/api/types';
import { useAuth } from '@/lib/auth/use-auth';
import { formatKgFixed, formatRate, plural } from '@/lib/format';

export const Route = createFileRoute('/materials')({
  component: () => (
    <Guarded page="materials">
      <MaterialsPage />
    </Guarded>
  ),
});

function MaterialsPage() {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const pager = usePager(100, { q: useDebounced(query.trim()) });
  const list = useMaterials(pager.params);
  const remove = useDeleteMaterial();
  const [editing, setEditing] = useState<Material | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [removing, setRemoving] = useState<Material | null>(null);

  const isAdmin = user?.role === 'admin';
  const shown = list.data?.items ?? [];

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
      meta: { sticky: 'left' },
      cell: ({ row }) => (
        <span className="flex items-center gap-3">
          <MaterialMark className="size-9 rounded-lg" />
          <span className="font-medium">{row.original.name}</span>
        </span>
      ),
    },
    {
      accessorKey: 'carbon_factor',
      header: 'Carbon factor (kg CO₂ / kg)',
      meta: { align: 'right' },
      enableSorting: false,
      cell: ({ row }) => formatKgFixed(row.original.carbon_factor),
    },
    { accessorKey: 'gw_code', header: 'GW code', enableSorting: false },
    {
      accessorKey: 'price',
      header: 'Base price',
      meta: { align: 'right' },
      cell: ({ row }) => formatRate(row.original.price),
    },
    {
      id: 'actions',
      header: 'Actions',
      meta: { sticky: 'right' },
      cell: ({ row }) => actionsFor(row.original),
    },
  ];

  return (
    <>
      <PageHeader
        title="Material catalogue"
        description="The grades, rates and carbon factors behind every trade. Listed by material name, A–Z."
        actions={
          isAdmin && (
            <Button aria-label="Add material" onClick={() => openForm()}>
              <Plus data-icon="inline-start" />
              Add material
            </Button>
          )
        }
      />
      <div className="mb-6 space-y-4">
        <Toolbar
          label="Search material names"
          value={query}
          onChange={setQuery}
        />
        {!isAdmin && <Badge variant="outline">Read-only catalogue</Badge>}
      </div>
      <DataState
        query={list}
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
            <ListRow
              title={material.name}
              subtitle={`${formatKgFixed(material.carbon_factor)} kg CO₂ / kg · ${material.gw_code}`}
              value={formatRate(material.price)}
              onOpen={isAdmin ? () => openForm(material) : undefined}
              actions={
                isAdmin
                  ? [
                      {
                        label: `Edit ${material.name}`,
                        onSelect: () => openForm(material),
                      },
                      {
                        label: `Remove ${material.name}`,
                        onSelect: () => setRemoving(material),
                        destructive: true,
                      },
                    ]
                  : []
              }
            />
          )}
          footer={
            <>
              <span>{plural(shown.length, 'material grade')}</span>
              <span>Carbon factors apply per kg traded</span>
            </>
          }
        />
      </DataState>
      <Pager pager={pager} page={list.data} />
      <MaterialDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        material={editing}
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove ${removing?.name ?? 'material'}?`}
        description="It leaves the catalogue. Materials used in past trades or stock cannot be deleted. Past trades stay."
        confirmLabel="Remove material"
        onConfirm={() => {
          if (removing) {
            remove.mutate(removing.id, {
              onSuccess: () => toast.success('Material removed.'),
              onError: (error) => toast.error(errorText(error)),
            });
          }
          setRemoving(null);
        }}
      />
    </>
  );
}
