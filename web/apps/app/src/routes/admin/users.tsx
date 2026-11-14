import { useState } from 'react';
import { useDebounced } from '@/lib/use-debounced';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { Download, ShieldCheck, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Guarded } from '@/components/access-guard';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataState } from '@/components/data-state';
import { DataTable } from '@/components/data-table';
import { ChoiceSelect } from '@/components/filters';
import { Toolbar } from '@/components/toolbar';
import { PageHeader } from '@/components/page-header';
import { PersonAvatar } from '@/components/visuals';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ListRow } from '@/components/list-row';
import { RowActions, type RowAction } from '@/components/row-actions';
import { ResponsiveOverlay } from '@/components/responsive-overlay';
import {
  useAdminUsers,
  useSetUserRole,
  useSetBusinessVerified,
  useDeleteUser,
} from '@/lib/api/admin';
import { useExport } from '@/lib/api/exports';
import { roleLabel } from '@/lib/access';
import { useAuth } from '@/lib/auth/use-auth';
import type { Role, AdminUser } from '@/lib/api/types';
import { formatDate, plural } from '@/lib/format';

export const Route = createFileRoute('/admin/users')({
  component: () => (
    <Guarded page="users">
      <AdminPage />
    </Guarded>
  ),
});

const roleOptions = ['guest', 'business', 'collector', 'staff', 'admin'].map(
  (value) => ({ value, label: roleLabel(value) })
);
const filterOptions = [{ value: 'all', label: 'All roles' }, ...roleOptions];

function AdminPage() {
  return (
    <>
      <PageHeader
        title="People on 3REco"
        description="Manage accounts and access."
      />
      <UsersPage />
    </>
  );
}

function RoleSelect({
  user,
  labelled = false,
}: {
  user: AdminUser;
  labelled?: boolean;
}) {
  const change = useSetUserRole(user.id);
  const [nextRole, setNextRole] = useState<Role | null>(null);
  return (
    <div className="space-y-2">
      <fieldset disabled={change.isPending} className="space-y-1.5">
        {labelled && (
          <span aria-hidden="true" className="block text-sm font-medium">
            Role
          </span>
        )}
        <ChoiceSelect
          className={labelled ? 'w-full' : undefined}
          label={'Role for ' + user.name}
          value={user.role ?? ''}
          options={roleOptions}
          onChange={(role) => {
            if (role !== user.role) setNextRole(role as Role);
          }}
        />
      </fieldset>
      <ConfirmDialog
        open={nextRole !== null}
        onOpenChange={(open) => !open && setNextRole(null)}
        title={`Change the role of ${user.name}?`}
        description={`Change ${user.name} from ${roleLabel(user.role)} to ${roleLabel(nextRole)}? Their access will change straight away.`}
        confirmLabel="Change role"
        cancelLabel="Keep current role"
        onConfirm={() => {
          if (!nextRole || change.isPending) return;
          change.mutate(
            { role: nextRole },
            { onSuccess: () => toast.success('Role updated.') }
          );
          setNextRole(null);
        }}
      />
      {change.isError && (
        <p role="alert" className="text-sm text-destructive">
          {change.error.message} Try again.
        </p>
      )}
    </div>
  );
}

function UsersPage() {
  const { user: currentUser } = useAuth();
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
  const verify = useSetBusinessVerified();
  const download = useExport('users');
  const [roleUser, setRoleUser] = useState<AdminUser | null>(null);
  const [removing, setRemoving] = useState<AdminUser | null>(null);
  const [verifying, setVerifying] = useState<AdminUser | null>(null);
  const shown = list.data?.items ?? [];

  function rowActions(user: AdminUser): RowAction[] {
    return [
      ...(user.role === 'business'
        ? [
            {
              label: user.business_verified
                ? 'Remove verification'
                : 'Verify business',
              disabled: verify.isPending,
              onSelect: () => setVerifying(user),
            },
          ]
        : []),
      ...(user.id === currentUser?.id
        ? []
        : [
            {
              label: 'Remove user',
              destructive: true,
              disabled: remove.isPending,
              onSelect: () => setRemoving(user),
            },
          ]),
    ];
  }

  const columns: ColumnDef<AdminUser>[] = [
    {
      accessorKey: 'name',
      header: 'Person',
      meta: { main: true },
      cell: ({ row }) => (
        <span className="flex min-w-0 items-center gap-3">
          <PersonAvatar name={row.original.name} />
          <span className="min-w-0">
            <span className="block truncate font-medium">
              {row.original.name}
              {verifiedBadge(row.original)}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
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
      cell: ({ row }) => profileBadge(row.original),
    },
    {
      id: 'actions',
      header: 'Actions',
      enableSorting: false,
      cell: ({ row }) => (
        <RowActions
          name={row.original.name}
          actions={rowActions(row.original)}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6 pt-4">
      <Toolbar
        label="Search names or emails"
        value={search}
        onChange={setSearch}
        activeFilters={Number(role !== 'all')}
        onClear={() => setRole('all')}
        filters={
          <ChoiceSelect
            label="Role"
            value={role}
            options={filterOptions}
            onChange={setRole}
          />
        }
        action={
          <Button
            className="min-h-11 max-lg:w-11 max-lg:px-0 max-lg:has-data-[icon=inline-start]:pl-0"
            aria-label={download.isPending ? 'Exporting…' : 'Export users'}
            variant="outline"
            disabled={download.isPending}
            onClick={() =>
              download.mutate({ role: role === 'all' ? undefined : role, q })
            }
          >
            <Download data-icon="inline-start" />
            <span className="max-lg:sr-only">
              {download.isPending ? 'Exporting…' : 'Export users'}
            </span>
          </Button>
        }
      />
      {(remove.error || download.error || verify.error) && (
        <p role="alert" className="text-sm text-destructive">
          {(remove.error ?? download.error ?? verify.error)?.message} Try again.
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
            <ListRow
              media={<PersonAvatar name={user.name} className="size-10" />}
              title={user.name}
              subtitle={
                <>
                  {user.email ?? 'No email'}
                  <span className="max-sm:hidden">
                    {' · Joined ' + formatDate(user.created_at)}
                  </span>
                </>
              }
              status={
                <>
                  {profileBadge(user)}
                  {verifiedBadge(user)}
                </>
              }
              actions={
                user.id === currentUser?.id
                  ? []
                  : [
                      {
                        label: 'Change role',
                        onSelect: () => setRoleUser(user),
                      },
                      ...(user.role === 'business'
                        ? [
                            {
                              label: user.business_verified
                                ? 'Remove verification'
                                : 'Verify business',
                              onSelect: () => setVerifying(user),
                            },
                          ]
                        : []),
                      {
                        label: 'Remove user',
                        onSelect: () => setRemoving(user),
                        destructive: true,
                      },
                    ]
              }
            />
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
          disabled={
            shown.length === 0 ||
            !list.data?.has_more ||
            !list.data.next_cursor ||
            list.isFetching ||
            list.isError
          }
          onClick={() => setCursor(list.data?.next_cursor ?? undefined)}
        >
          Next page
        </Button>
      </div>
      <ResponsiveOverlay
        open={roleUser !== null}
        onOpenChange={(open) => !open && setRoleUser(null)}
        title={`Change role for ${roleUser?.name ?? 'user'}`}
        description="Choose a role, then confirm the change."
      >
        {roleUser && <RoleSelect key={roleUser.id} user={roleUser} labelled />}
      </ResponsiveOverlay>
      <ConfirmDialog
        key={'verify-' + (verifying?.id ?? 'none')}
        open={verifying !== null}
        onOpenChange={(open) => !open && setVerifying(null)}
        title={
          verifying?.business_verified
            ? `Remove verification for ${verifying.name}?`
            : `Verify ${verifying?.name ?? 'this business'}?`
        }
        description={
          verifying?.business_verified
            ? 'They will no longer see or edit collectors added by others. Collectors they added stay theirs.'
            : 'A verified business can see the contact and payout details of every collector, and edit any of them. Only verify a business you trust.'
        }
        confirmLabel={
          verifying?.business_verified
            ? 'Remove verification'
            : 'Verify business'
        }
        destructive={verifying?.business_verified ?? false}
        onConfirm={() => {
          if (!verifying) return;
          const verified = !verifying.business_verified;
          verify.mutate(
            { id: verifying.id, verified },
            {
              onSuccess: () =>
                toast.success(
                  verified ? 'Business verified.' : 'Verification removed.'
                ),
              onError: (error) => toast.error(error.message),
            }
          );
          setVerifying(null);
        }}
      />
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

function verifiedBadge(user: AdminUser) {
  if (user.role !== 'business' || !user.business_verified) return null;

  return (
    <Badge className="ml-2 align-middle" variant="secondary">
      <ShieldCheck data-icon="inline-start" />
      Verified
    </Badge>
  );
}

/** Admin and staff need no profile, so their rows never say "Incomplete". */
function profileBadge(user: {
  role: string | null;
  profile_complete: boolean;
}) {
  if (user.role === 'admin' || user.role === 'staff') return null;

  return (
    <Badge variant="secondary">
      {user.profile_complete ? 'Complete' : 'Incomplete'}
    </Badge>
  );
}
