import { formatDate } from '@/lib/format';
import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { Download, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Guarded } from '@/components/access-guard';
import { StatusBadge } from '@/components/badges';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataState, RowsSkeleton } from '@/components/data-state';
import { DataTable } from '@/components/data-table';
import { ChoiceSelect, SearchBox } from '@/components/filters';
import { PageHeader } from '@/components/page-header';
import { PersonAvatar } from '@/components/visuals';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useMockList } from '@/lib/mock/hooks';
import type { Role, UserRecord } from '@/lib/types';

export const Route = createFileRoute('/admin/users')({
  component: () => (
    <Guarded page="users">
      <UsersPage />
    </Guarded>
  ),
});

const roleOptions = ['business', 'collector', 'staff', 'admin'];
const filterOptions = [{ value: 'all', label: 'All roles' }, ...roleOptions];

function UsersPage() {
  const list = useMockList('users');
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('all');
  const [removing, setRemoving] = useState<UserRecord | null>(null);

  const shown = list.items.filter((user) => {
    if (role !== 'all' && user.role !== role) return false;

    return `${user.name} ${user.email}`
      .toLowerCase()
      .includes(query.toLowerCase());
  });

  function changeRole(user: UserRecord, next: string) {
    list.update(user.id, { role: next as Exclude<Role, 'signed-out'> });
    toast.success(`${user.name} is now ${next}.`);
  }

  function roleSelect(user: UserRecord) {
    return (
      <ChoiceSelect
        label={`Role for ${user.name}`}
        value={user.role}
        options={roleOptions}
        onChange={(next) => changeRole(user, next)}
      />
    );
  }

  function removeButton(user: UserRecord) {
    return (
      <Button variant="destructive" size="sm" onClick={() => setRemoving(user)}>
        <Trash2 data-icon="inline-start" />
        Remove user
      </Button>
    );
  }

  const columns: ColumnDef<UserRecord>[] = [
    {
      accessorKey: 'name',
      header: 'Person',
      cell: ({ row }) => (
        <span className="flex items-center gap-3">
          <PersonAvatar name={row.original.name} />
          <span>
            <span className="block font-medium">{row.original.name}</span>
            <span className="text-xs text-muted-foreground">
              {row.original.email}
            </span>
          </span>
        </span>
      ),
    },
    {
      id: 'role',
      header: 'Role',
      enableSorting: false,
      cell: ({ row }) => roleSelect(row.original),
    },
    {
      accessorKey: 'joined',
      header: 'Joined',
      cell: ({ row }) => formatDate(row.original.joined),
    },
    {
      accessorKey: 'profile',
      header: 'Profile',
      cell: ({ row }) => <StatusBadge status={row.original.profile} />,
    },
    {
      id: 'actions',
      header: 'Actions',
      enableSorting: false,
      cell: ({ row }) => removeButton(row.original),
    },
  ];

  return (
    <>
      <PageHeader
        title="People on 3REco"
        description="Change a role or remove an account."
        actions={
          <Button
            variant="outline"
            onClick={() => toast('User export is coming soon.')}
          >
            <Download data-icon="inline-start" />
            Export users
          </Button>
        }
      />
      <div className="mb-6 flex flex-wrap gap-3">
        <SearchBox
          label="Search names or emails"
          value={query}
          onChange={setQuery}
        />
        <ChoiceSelect
          label="Role"
          value={role}
          options={filterOptions}
          onChange={setRole}
        />
      </div>
      <DataState
        isEmpty={shown.length === 0}
        icon={Users}
        emptyTitle="No one matches"
        emptyText="Try another name or role."
        skeleton={<RowsSkeleton />}
      >
        <DataTable
          columns={columns}
          data={shown}
          renderCard={(user) => (
            <Card size="sm">
              <CardContent className="space-y-3">
                <span className="flex items-center gap-3">
                  <PersonAvatar name={user.name} />
                  <span>
                    <span className="block font-medium">{user.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {user.email}
                    </span>
                  </span>
                </span>
                {roleSelect(user)}
                <StatusBadge status={user.profile} />
                {removeButton(user)}
              </CardContent>
            </Card>
          )}
          footer={
            <>
              <span>{shown.length} users shown</span>
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
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove ${removing?.name ?? 'user'}?`}
        description="They lose access straight away. Their trade records stay."
        confirmLabel="Remove user"
        onConfirm={() => {
          if (removing) list.remove(removing.id);
          setRemoving(null);
          toast.success('User removed.');
        }}
      />
    </>
  );
}
