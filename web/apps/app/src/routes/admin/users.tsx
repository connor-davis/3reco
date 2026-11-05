import BackButton from '@/components/back-button';
import {
  TypedConfirmationField,
  matchesTypedConfirmation,
} from '@/components/dialogs/typed-confirmation';
import PageHeaderActions from '@/components/page-header-actions';
import { VirtualizedPaginatedList } from '@/components/virtualized-paginated-list';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useConvexMutation, useConvexPaginatedQuery } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { createFileRoute } from '@tanstack/react-router';
import { ConvexError } from 'convex/values';
import { useMutation, useQuery } from 'convex/react';
import { DownloadIcon, SearchIcon, Trash2Icon, UsersIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { downloadCsv } from '@/lib/export-csv';

export const Route = createFileRoute('/admin/users')({
  component: RouteComponent,
});

type UserType = 'admin' | 'staff' | 'business' | 'collector';

const USER_TYPE_LABELS: Record<UserType, string> = {
  admin: 'Admin',
  staff: 'Staff',
  business: 'Business',
  collector: 'Collector',
};

function DeleteUserDialog({
  userId,
  name,
  confirmationLabel,
  confirmationValue,
}: {
  userId: Id<'users'>;
  name: string;
  confirmationLabel: string;
  confirmationValue: string;
}) {
  const [open, setOpen] = useState(false);
  const [confirmationInput, setConfirmationInput] = useState('');
  const removeUser = useConvexMutation(api.users.removeUser);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setConfirmationInput('');
        }
      }}
    >
      <DialogTrigger
        render={
          <Button variant="destructive" size="icon-sm" />
        }
      >
        <Trash2Icon />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove User</DialogTitle>
          <DialogDescription>
            Enter <strong>{confirmationValue}</strong> ({confirmationLabel}) to
            remove <strong>{name}</strong>.
          </DialogDescription>
        </DialogHeader>
        <TypedConfirmationField
          expectedValue={confirmationValue}
          confirmationLabel={confirmationLabel}
          value={confirmationInput}
          onChange={setConfirmationInput}
        />
        <DialogFooter showCloseButton>
          <Button
            variant="destructive"
            disabled={
              !matchesTypedConfirmation(confirmationInput, confirmationValue)
            }
            onClick={() =>
              toast.promise(removeUser({ _id: userId }), {
                loading: 'Removing user...',
                success: () => {
                  setOpen(false);
                  setConfirmationInput('');
                  return 'User removed.';
                },
                error: (error: Error) => {
                  if (error instanceof ConvexError) {
                    return {
                      message: error.data.name,
                      description: error.data.message,
                    };
                  }
                  return { message: error.name, description: error.message };
                },
              })
            }
          >
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UserRow({ user, isAdmin, onRoleChange }: { user: { _id: Id<'users'>; name?: string; email?: string; firstName?: string; lastName?: string; businessName?: string; role?: string; profileComplete?: boolean }; isAdmin: boolean; onRoleChange: (userId: Id<'users'>, role: UserType) => void }) {
  const displayName =
    user.businessName ||
    user.name ||
    [user.firstName, user.lastName].filter(Boolean).join(' ') ||
    user.email ||
    'Unknown';

  function handleRoleChange(value: string | null) {
    if (!value) return;
    onRoleChange(user._id, value as UserType);
  }

  return (
      <Item variant="backgroundOutline">
      <ItemContent>
        <ItemTitle>{displayName}</ItemTitle>
        <ItemDescription>{user.email}</ItemDescription>
      </ItemContent>
      <ItemActions className="flex-wrap justify-end">
        <Select
          value={user.role as UserType | undefined}
          onValueChange={handleRoleChange}
        >
          <SelectTrigger size="sm" className="w-full sm:w-36">
            <SelectValue placeholder="Set role">
              {user.role ? USER_TYPE_LABELS[user.role as UserType] : undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="staff">Staff</SelectItem>
            <SelectItem value="business">Business</SelectItem>
            <SelectItem value="collector">Collector</SelectItem>
          </SelectContent>
        </Select>
        {isAdmin && (
          <DeleteUserDialog
            userId={user._id}
            name={displayName}
            confirmationLabel={user.email ? 'email' : 'name'}
            confirmationValue={user.email ?? displayName}
          />
        )}
      </ItemActions>
    </Item>
  );
}

function RouteComponent() {
  const {
    results: users,
    status,
    loadMore,
  } = useConvexPaginatedQuery(api.users.listAll, {}, { initialNumItems: 50 });
  const isInitialLoading = status === 'LoadingFirstPage';
  const isLoadingMore = status === 'LoadingMore';
  const canLoadMore = status === 'CanLoadMore' || isLoadingMore;

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserType>('all');

  const currentUser = useQuery(api.users.currentUser);
  const isAdmin = currentUser?.role === 'admin';

  const setUserRole = useMutation(api.users.setUserRole);

  const exportData = useQuery(api.exports.exportUsers, {});

  function handleRoleChange(userId: Id<'users'>, role: UserType) {
    const promise = setUserRole({ userId, role });
    toast.promise(promise, {
      loading: 'Updating role...',
      success: 'Role updated.',
      error: (error: Error) => {
        if (error instanceof ConvexError) {
          return { message: error.data.name, description: error.data.message };
        }
        return { message: error.name, description: error.message };
      },
    });
  }

  const filtered = users?.filter((u) => {
    const displayName =
      (u as { businessName?: string }).businessName ||
      (u as { name?: string }).name ||
      [(u as { firstName?: string }).firstName, (u as { lastName?: string }).lastName].filter(Boolean).join(' ') ||
      (u as { email?: string }).email ||
      '';
    if (search) {
      const q = search.toLowerCase();
      const matchName = displayName.toLowerCase().includes(q);
      const matchEmail = ((u as { email?: string }).email ?? '').toLowerCase().includes(q);
      if (!matchName && !matchEmail) return false;
    }
    if (roleFilter !== 'all' && (u as { role?: string }).role !== roleFilter) return false;
    return true;
  });

  return (
    <div className="flex flex-col w-full h-full gap-3 overflow-hidden">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <BackButton />
          <Label className="text-lg">User Management</Label>
        </div>
        <div className="flex w-full items-center justify-end gap-2 sm:ml-auto sm:w-auto sm:gap-3">
          <PageHeaderActions
            title="Manage users"
            description="Search, filter, or export users."
          >
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search users..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 w-full"
              />
            </div>
            <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as typeof roleFilter)}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  {roleFilter === 'all' ? 'All roles' : USER_TYPE_LABELS[roleFilter]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="staff">Staff</SelectItem>
                <SelectItem value="business">Business</SelectItem>
                <SelectItem value="collector">Collector</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              className="w-full"
              disabled={!exportData || exportData.length === 0}
              onClick={() => exportData && downloadCsv(exportData as Record<string, unknown>[], 'users.csv')}
            >
              <DownloadIcon className="size-4" />
              Export CSV
            </Button>
          </PageHeaderActions>
        </div>
      </div>

      {isInitialLoading ? (
        <div className="flex flex-col w-full h-full items-center justify-center">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <UsersIcon />
              </EmptyMedia>
              <EmptyTitle>Loading Users...</EmptyTitle>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <>
        {filtered && filtered.length === 0 && (
          <div className="flex flex-col w-full h-full items-center justify-center">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <UsersIcon />
                </EmptyMedia>
                <EmptyTitle>{search || roleFilter !== 'all' ? 'No results found' : 'No users yet'}</EmptyTitle>
                <EmptyDescription>
                  {search || roleFilter !== 'all' ? 'Try a different search or filter.' : 'No users yet.'}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        )}

        {filtered && filtered.length > 0 && (
          <VirtualizedPaginatedList
            className="h-full"
            items={filtered}
            hasMore={canLoadMore}
            isLoadingMore={isLoadingMore}
            loadMore={() => loadMore(50)}
            getItemKey={(user) => user._id}
            renderItem={(user) => (
              <UserRow key={user._id} user={user} isAdmin={isAdmin} onRoleChange={handleRoleChange} />
            )}
          />
        )}
        </>
      )}
    </div>
  );
}
