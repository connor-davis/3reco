import { useState } from 'react';
import { useDebounced } from '@/lib/use-debounced';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { Download, Trash2, Users, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Guarded } from '@/components/access-guard';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataState } from '@/components/data-state';
import { DataTable } from '@/components/data-table';
import { ChoiceSelect, SearchBox } from '@/components/filters';
import { PageHeader } from '@/components/page-header';
import { PersonAvatar } from '@/components/visuals';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useAdminUsers,
  useSetUserRole,
  useDeleteUser,
  usePrivacyEvents,
} from '@/lib/api/admin';
import { useExport } from '@/lib/api/exports';
import type { Role, AdminUser, PrivacyEvent } from '@/lib/api/types';
import { formatDate, plural } from '@/lib/format';

export const Route = createFileRoute('/admin/users')({
  component: () => (
    <Guarded page="users">
      <AdminPage />
    </Guarded>
  ),
});

const roleOptions = ['guest', 'business', 'collector', 'staff', 'admin'];
const filterOptions = [{ value: 'all', label: 'All roles' }, ...roleOptions];

function AdminPage() {
  return (
    <>
      <PageHeader
        title="People on 3REco"
        description="Manage accounts and review privacy activity."
      />
      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="privacy">Privacy events</TabsTrigger>
        </TabsList>
        <TabsContent value="users">
          <UsersPage />
        </TabsContent>
        <TabsContent value="privacy">
          <PrivacyEvents />
        </TabsContent>
      </Tabs>
    </>
  );
}

function RoleSelect({ user }: { user: AdminUser }) {
  const change = useSetUserRole(user.id);
  return (
    <div className="space-y-2">
      <fieldset disabled={change.isPending}>
        <ChoiceSelect
          label={'Role for ' + user.name}
          value={user.role ?? ''}
          options={roleOptions}
          onChange={(role) =>
            change.mutate(
              { role: role as Role },
              { onSuccess: () => toast.success('Role updated.') }
            )
          }
        />
      </fieldset>
      {change.isError && (
        <p role="alert" className="text-sm text-destructive">
          {change.error.message} Try again.
        </p>
      )}
    </div>
  );
}

function UsersPage() {
  const [cursor, setCursor] = useState<string | undefined>();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('all');
  const q = useDebounced(search.trim());
  // A cursor was handed out for one search, so a new search starts at page one.
  const [seen, setSeen] = useState({ q, role });
  if (seen.q !== q || seen.role !== role) {
    setSeen({ q, role });
    setCursor(undefined);
  }
  const list = useAdminUsers({
    cursor: seen.q === q && seen.role === role ? cursor : undefined,
    limit: 50,
    q,
    role: role === 'all' ? undefined : role,
  });
  const remove = useDeleteUser();
  const download = useExport('users');
  const [removing, setRemoving] = useState<AdminUser | null>(null);
  const shown = list.data?.items ?? [];

  function removeButton(user: AdminUser) {
    return (
      <Button
        className="min-h-11"
        variant="destructive"
        disabled={remove.isPending}
        onClick={() => setRemoving(user)}
      >
        <Trash2 data-icon="inline-start" />
        Remove user
      </Button>
    );
  }

  const columns: ColumnDef<AdminUser>[] = [
    {
      accessorKey: 'name',
      header: 'Person',
      meta: { sticky: 'left' },
      cell: ({ row }) => (
        <span className="flex items-center gap-3">
          <PersonAvatar name={row.original.name} />
          <span>
            <span className="block font-medium">{row.original.name}</span>
            <span className="text-xs text-muted-foreground">
              {row.original.email ?? 'No email'}
            </span>
          </span>
        </span>
      ),
    },
    {
      id: 'role',
      header: 'Role',
      enableSorting: false,
      cell: ({ row }) => <RoleSelect user={row.original} />,
    },
    {
      accessorKey: 'created_at',
      header: 'Joined',
      cell: ({ row }) => formatDate(row.original.created_at),
    },
    {
      accessorKey: 'profile_complete',
      header: 'Profile',
      cell: ({ row }) => (
        <Badge variant="secondary">
          {row.original.profile_complete ? 'Complete' : 'Incomplete'}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      meta: { sticky: 'right' },
      enableSorting: false,
      cell: ({ row }) => removeButton(row.original),
    },
  ];

  return (
    <div className="space-y-6 pt-4">
      <div className="flex flex-wrap gap-3">
        <SearchBox
          label="Search names or emails"
          value={search}
          onChange={setSearch}
        />
        <ChoiceSelect
          label="Role"
          value={role}
          options={filterOptions}
          onChange={setRole}
        />
        <Button
          className="min-h-11"
          variant="outline"
          disabled={download.isPending}
          onClick={() => download.mutate({})}
        >
          <Download data-icon="inline-start" />
          {download.isPending ? 'Exporting…' : 'Export users'}
        </Button>
      </div>
      {(remove.error || download.error) && (
        <p role="alert" className="text-sm text-destructive">
          {(remove.error ?? download.error)?.message} Try again.
        </p>
      )}
      <DataState
        query={list}
        isEmpty={shown.length === 0}
        icon={Users}
        emptyTitle="No one matches"
        emptyText="Try another name or role."
      >
        <DataTable
          columns={columns}
          data={shown}
          renderCard={(user) => (
            <Card size="sm">
              <CardContent className="space-y-3">
                <p className="font-medium">{user.name}</p>
                <p className="text-sm text-muted-foreground">
                  {user.email ?? 'No email'} · Joined{' '}
                  {formatDate(user.created_at)}
                </p>
                <RoleSelect user={user} />
                <Badge variant="secondary">
                  {user.profile_complete ? 'Complete' : 'Incomplete'}
                </Badge>
                {removeButton(user)}
              </CardContent>
            </Card>
          )}
        />
      </DataState>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">
          {plural(shown.length, 'user')} shown
        </span>
        {cursor && (
          <Button
            className="min-h-11"
            variant="outline"
            onClick={() => setCursor(undefined)}
          >
            First page
          </Button>
        )}
        <Button
          className="min-h-11"
          variant="outline"
          disabled={!list.data?.has_more || list.isFetching || list.isError}
          onClick={() => setCursor(list.data?.next_cursor ?? undefined)}
        >
          Next page
        </Button>
      </div>
      <ConfirmDialog
        key={removing?.id ?? 'none'}
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={'Remove ' + (removing?.name ?? 'user') + '?'}
        description="This is permanent and cannot be undone. They are signed out straight away and cannot sign in again. Their trade records stay because they must be kept by law, but their personal details are removed from those records."
        confirmLabel="Remove user"
        typedName={removing?.email ?? removing?.name}
        onConfirm={() => {
          if (!removing) return;
          remove.mutate(removing.id, {
            onSuccess: () => {
              setRemoving(null);
              toast.success('User removed.');
            },
          });
        }}
      />
    </div>
  );
}

const privacyKinds: Record<string, string> = {
  export: 'Data download',
  delete: 'Account deletion',
  admin_full_view: 'Full identifier viewed',
};

/** Privacy event rows identify people by name and role. */
function PartyCell({
  name,
  role,
}: {
  name: string | null;
  role: string | null;
}) {
  return (
    <span className="block">
      <span className="block font-medium">
        {name ?? 'Unknown'}
        {role && (
          <span className="font-normal text-muted-foreground"> · {role}</span>
        )}
      </span>
    </span>
  );
}

function PrivacyEvents() {
  const [cursor, setCursor] = useState<string | undefined>();
  const query = usePrivacyEvents({ cursor, limit: 50 });
  const columns: ColumnDef<PrivacyEvent>[] = [
    {
      accessorKey: 'kind',
      header: 'Event',
      cell: ({ row }) => privacyKinds[row.original.kind] ?? row.original.kind,
    },
    {
      id: 'actor',
      header: 'Done by',
      cell: ({ row }) => (
        <PartyCell
          name={row.original.actor_name}
          role={row.original.actor_role}
        />
      ),
    },
    {
      id: 'subject',
      header: 'About',
      cell: ({ row }) =>
        row.original.subject_id ? (
          <PartyCell
            name={row.original.subject_name}
            role={row.original.subject_role}
          />
        ) : (
          'No individual subject'
        ),
    },
    {
      accessorKey: 'created_at',
      header: 'Date',
      cell: ({ row }) => formatDate(row.original.created_at),
    },
  ];
  return (
    <div className="space-y-4 pt-4">
      <p className="text-sm text-muted-foreground">
        Data exports, account deletions and administrator access to full
        identifiers. Records are kept for two years.
      </p>
      <DataState
        query={query}
        isEmpty={query.data?.items.length === 0}
        icon={ShieldCheck}
        emptyTitle="No privacy events"
        emptyText="Privacy activity will appear here."
      >
        <DataTable
          columns={columns}
          data={query.data?.items ?? []}
          renderCard={(event) => (
            <Card size="sm">
              <CardContent className="space-y-2 break-all text-sm">
                <p className="font-medium">
                  {privacyKinds[event.kind] ?? event.kind}
                </p>
                <PartyCell name={event.actor_name} role={event.actor_role} />
                {event.subject_id ? (
                  <PartyCell
                    name={event.subject_name}
                    role={event.subject_role}
                  />
                ) : (
                  <p>No individual subject</p>
                )}
                <p>{formatDate(event.created_at)}</p>
              </CardContent>
            </Card>
          )}
        />
      </DataState>
      <div className="flex gap-3">
        {cursor && (
          <Button
            className="min-h-11"
            variant="outline"
            onClick={() => setCursor(undefined)}
          >
            First page
          </Button>
        )}
        <Button
          className="min-h-11"
          variant="outline"
          disabled={!query.data?.has_more || query.isFetching || query.isError}
          onClick={() => setCursor(query.data?.next_cursor ?? undefined)}
        >
          Next page
        </Button>
      </div>
    </div>
  );
}
