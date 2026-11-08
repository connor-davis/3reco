import { useState } from 'react';
import { useDebounced } from '@/lib/use-debounced';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { PackageOpen, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Guarded } from '@/components/access-guard';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataState, RowsSkeleton } from '@/components/data-state';
import { DataTable } from '@/components/data-table';
import { StockDialog } from '@/components/dialogs/stock-dialog';
import { ChoiceSelect, SearchBox } from '@/components/filters';
import { IconButton } from '@/components/icon-button';
import { PageHeader } from '@/components/page-header';
import { MaterialMark, Pager } from '@/components/transactions/list-tools';
import { errorText, usePager } from '@/components/transactions/pager-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import { useDeleteStock, useStock, useUpdateStock } from '@/lib/api/stock';
import type { StockItem } from '@/lib/api/types';
import { formatKg, formatRate, toGrams, plural } from '@/lib/format';

export const Route = createFileRoute('/stock')({
  component: () => (
    <Guarded page="stock">
      <StockPage />
    </Guarded>
  ),
});

const statusOptions = [
  { value: 'all', label: 'All stock' },
  { value: 'listed', label: 'Listed' },
  { value: 'unlisted', label: 'Unlisted' },
];

/** What is held for open offers, or null when nothing is. */
function heldKg(item: StockItem) {
  const held = toGrams(item.weight) - toGrams(item.available_weight);

  return held > 0 ? held / 1000 : null;
}

function ListingSwitch({ item }: { item: StockItem }) {
  const update = useUpdateStock(item.id);

  function toggle(is_listed: boolean) {
    update.mutate(
      { is_listed },
      {
        onSuccess: () =>
          toast.success(
            is_listed
              ? 'Stock is now listed in the market.'
              : 'Stock is no longer listed.'
          ),
        onError: (error) => toast.error(errorText(error)),
      }
    );
  }

  return (
    <Field orientation="horizontal" className="w-auto">
      <Switch
        id={`listed-${item.id}`}
        checked={item.is_listed}
        disabled={update.isPending}
        onCheckedChange={toggle}
      />
      <FieldLabel htmlFor={`listed-${item.id}`} className="font-normal">
        <span className="sr-only">{item.material_name}: </span>
        {item.is_listed ? 'Listed' : 'Unlisted'}
      </FieldLabel>
    </Field>
  );
}

function Weights({ item }: { item: StockItem }) {
  const held = heldKg(item);

  return (
    <span>
      {held === null ? (
        <span className="block">{formatKg(item.weight)} in stock</span>
      ) : (
        <>
          <span className="block">
            {formatKg(item.available_weight)} available
          </span>
          <span className="text-xs text-muted-foreground">
            {formatKg(item.weight)} in stock
            {` · ${formatKg(held)} held for offers`}
          </span>
        </>
      )}
    </span>
  );
}

function StockPage() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const pager = usePager(50, {
    q: useDebounced(query.trim()),
    status: status === 'all' ? undefined : status,
  });
  const stock = useStock(pager.params);
  const remove = useDeleteStock();
  const [editing, setEditing] = useState<StockItem | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [removing, setRemoving] = useState<StockItem | null>(null);

  const shown = stock.data?.items ?? [];

  function openForm(item?: StockItem) {
    setEditing(item);
    setFormOpen(true);
  }

  function actions(item: StockItem) {
    // Two lots can share a material, so the name carries weight and price.
    const lot = `${item.material_name}, ${formatKg(item.weight)} at ${formatRate(item.price)}`;
    return (
      <div className="flex gap-1">
        <IconButton label={`Edit ${lot}`} onClick={() => openForm(item)}>
          <Pencil />
        </IconButton>
        <IconButton label={`Remove ${lot}`} onClick={() => setRemoving(item)}>
          <Trash2 />
        </IconButton>
      </div>
    );
  }

  const columns: ColumnDef<StockItem>[] = [
    {
      accessorKey: 'material_name',
      header: 'Material',
      meta: { sticky: 'left' },
      cell: ({ row }) => (
        <span className="flex items-center gap-3">
          <MaterialMark className="size-9 rounded-lg" />
          <span className="font-medium">{row.original.material_name}</span>
        </span>
      ),
    },
    {
      id: 'weight',
      header: 'Weight',
      meta: { align: 'right' },
      enableSorting: false,
      cell: ({ row }) => <Weights item={row.original} />,
    },
    {
      accessorKey: 'price',
      header: 'Price / kg',
      meta: { align: 'right' },
      cell: ({ row }) => formatRate(row.original.price),
    },
    {
      id: 'listed',
      header: 'Market listing',
      enableSorting: false,
      cell: ({ row }) => <ListingSwitch item={row.original} />,
    },
    {
      id: 'actions',
      header: 'Actions',
      meta: { sticky: 'right' },
      enableSorting: false,
      cell: ({ row }) => actions(row.original),
    },
  ];

  return (
    <>
      <PageHeader
        title="Your stock"
        description="What's in the yard, ready for the next conversation."
        actions={
          <Button onClick={() => openForm()}>
            <Plus data-icon="inline-start" />
            Add stock
          </Button>
        }
      />
      <div className="mb-6 flex flex-wrap gap-3">
        <SearchBox
          label="Search your materials"
          value={query}
          onChange={setQuery}
        />
        <ChoiceSelect
          label="Listing status"
          value={status}
          options={statusOptions}
          onChange={setStatus}
        />
      </div>
      <DataState
        query={stock}
        isEmpty={shown.length === 0}
        icon={PackageOpen}
        emptyTitle="No stock here"
        emptyText="Add what you have and list it for buyers."
        emptyAction={<Button onClick={() => openForm()}>Add stock</Button>}
        skeleton={<RowsSkeleton />}
      >
        <DataTable
          columns={columns}
          data={shown}
          renderCard={(item) => (
            <Card size="sm">
              <CardContent className="space-y-2">
                <p className="font-medium">{item.material_name}</p>
                <p className="text-sm text-muted-foreground">
                  {formatRate(item.price)}
                </p>
                <Weights item={item} />
                <ListingSwitch item={item} />
                {actions(item)}
              </CardContent>
            </Card>
          )}
          footer={
            <>
              <span>{plural(shown.length, 'material')} on this page</span>
              <span>Listed stock is visible in the market.</span>
            </>
          }
        />
      </DataState>
      <Pager pager={pager} page={stock.data} />
      <StockDialog open={formOpen} onOpenChange={setFormOpen} stock={editing} />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove ${removing?.material_name ?? 'stock'}?`}
        description="It is taken off the market and out of your stock."
        confirmLabel="Remove stock"
        onConfirm={() => {
          if (removing) {
            remove.mutate(removing.id, {
              onSuccess: () => toast.success('Stock removed.'),
              onError: (error) => toast.error(errorText(error)),
            });
          }
          setRemoving(null);
        }}
      />
    </>
  );
}
