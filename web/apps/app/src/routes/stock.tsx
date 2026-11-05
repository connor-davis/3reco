import { useState } from 'react';
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
import { MaterialThumb } from '@/components/visuals';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import { materialById } from '@/lib/data/materials';
import { formatKg, formatRate } from '@/lib/format';
import { useMockList } from '@/lib/mock/hooks';
import type { Listing } from '@/lib/types';

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

function StockPage() {
  const list = useMockList('stock');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [editing, setEditing] = useState<Listing | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [removing, setRemoving] = useState<Listing | null>(null);

  const shown = list.items.filter((item) => {
    if (status === 'listed' && !item.listed) return false;
    if (status === 'unlisted' && item.listed) return false;

    return item.title.toLowerCase().includes(query.toLowerCase());
  });

  function openForm(item?: Listing) {
    setEditing(item);
    setFormOpen(true);
  }

  function toggle(item: Listing, listed: boolean) {
    list.update(item.id, { listed });
    toast.success(
      listed
        ? 'Stock is now listed in the market.'
        : 'Stock is no longer listed.'
    );
  }

  function actions(item: Listing) {
    return (
      <div className="flex gap-1">
        <IconButton label={`Edit ${item.title}`} onClick={() => openForm(item)}>
          <Pencil />
        </IconButton>
        <IconButton
          label={`Remove ${item.title}`}
          onClick={() => setRemoving(item)}
        >
          <Trash2 />
        </IconButton>
      </div>
    );
  }

  const listingSwitch = (item: Listing) => (
    <Field orientation="horizontal" className="w-auto">
      <Switch
        id={`listed-${item.id}`}
        checked={item.listed}
        onCheckedChange={(checked) => toggle(item, checked)}
      />
      <FieldLabel htmlFor={`listed-${item.id}`} className="font-normal">
        <span className="sr-only">{item.title}: </span>
        {item.listed ? 'Listed' : 'Unlisted'}
      </FieldLabel>
    </Field>
  );

  const columns: ColumnDef<Listing>[] = [
    {
      accessorKey: 'title',
      header: 'Material',
      cell: ({ row }) => {
        const material = materialById(row.original.materialId);

        return (
          <span className="flex items-center gap-3">
            <MaterialThumb
              category={material.category}
              className="size-9 rounded-lg"
            />
            <span>
              <span className="block font-medium">{row.original.title}</span>
              <span className="text-xs text-muted-foreground">
                {material.tag}
              </span>
            </span>
          </span>
        );
      },
    },
    {
      accessorKey: 'availableKg',
      header: 'Available',
      cell: ({ row }) => formatKg(row.original.availableKg),
    },
    {
      id: 'price',
      header: 'Price / kg',
      enableSorting: false,
      cell: ({ row }) => formatRate(row.original.priceBreaks[0].pricePerKg),
    },
    {
      id: 'listed',
      header: 'Market listing',
      enableSorting: false,
      cell: ({ row }) => listingSwitch(row.original),
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
                <p className="font-medium">{item.title}</p>
                <p className="text-sm text-muted-foreground">
                  {formatKg(item.availableKg)} ·{' '}
                  {formatRate(item.priceBreaks[0].pricePerKg)}
                </p>
                {listingSwitch(item)}
                {actions(item)}
              </CardContent>
            </Card>
          )}
          footer={
            <>
              <span>{shown.length} materials in your stock</span>
              <span>Listed stock is visible in the market.</span>
            </>
          }
        />
      </DataState>
      <StockDialog open={formOpen} onOpenChange={setFormOpen} stock={editing} />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove ${removing?.title ?? 'stock'}?`}
        description="It is taken off the market and out of your stock."
        confirmLabel="Remove stock"
        onConfirm={() => {
          if (removing) list.remove(removing.id);
          setRemoving(null);
          toast.success('Stock removed.');
        }}
      />
    </>
  );
}
