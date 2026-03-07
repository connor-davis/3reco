import BackButton from '@/components/back-button';
import PageHeaderDrawer from '@/components/page-header-drawer';
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
import { useQuery } from 'convex/react';
import { DownloadIcon, SearchIcon, Trash2Icon, UsersIcon } from 'lucide-react';
import { useState } from 'react';
import { Activity } from 'react';
import { toast } from 'sonner';
import { downloadCsv } from '@/lib/export-csv';

export const Route = createFileRoute('/admin/users')({
  component: RouteComponent,
});

type UserType = 'admin' | 'staff' | 'business' | 'collector';

function DeleteUserDialog({ userId, name }: { userId: Id<'users'>; name: string }) {
  const [open, setOpen] = useState(false);
  const removeUser = useConvexMutation(api.users.removeUser);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
            Are you sure you want to remove <strong>{name}</strong>? This cannot
            be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter showCloseButton>
          <Button
            variant="destructive"
            onClick={() =>
              toast.promise(removeUser({ _id: userId }), {
                loading: 'Removing user...',
                success: () => {
                  setOpen(false);
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

function UserRow({ user, isAdmin }: { user: { _id: Id<'users'>; name?: string; email?: string; firstName?: string; lastName?: string; businessName?: string; role?: UserType; profileComplete?: boolean }; isAdmin: boolean }) {
  const setRole = useConvexMutation(api.users.setRole);
  const displayName =
    user.businessName ||
    user.name ||
    [user.firstName, user.lastName].filter(Boolean).join(' ') ||
    user.email ||
    'Unknown';

  return (
    <Item variant="muted">
      <ItemContent>
        <ItemTitle>{displayName}</ItemTitle>
        <ItemDescription>{user.email}</ItemDescription>
      </ItemContent>
      <ItemActions className="flex-wrap justify-end">
        <Select
          value={user.role}
          onValueChange={(value) =>
            toast.promise(
              setRole({ _id: user._id, role: value as UserType }),
              {
                loading: 'Updating role...',
                success: 'Role updated.',
                error: (error: Error) => {
                  if (error instanceof ConvexError) {
                    return {
                      message: error.data.name,
                      description: error.data.message,
                    };
                  }
                  return { message: error.name, description: error.message };
                },
              }
            )
          }
        >
          <SelectTrigger size="sm">
            <SelectValue placeholder="Set role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="staff">Staff</SelectItem>
            <SelectItem value="business">Business</SelectItem>
            <SelectItem value="collector">Collector</SelectItem>
          </SelectContent>
        </Select>
        {isAdmin && <DeleteUserDialog userId={user._id} name={displayName} />}
      </ItemActions>
    </Item>
  );
}

function RouteComponent() {
  const {
    results: users,
    isLoading,
    status,
    loadMore,
  } = useConvexPaginatedQuery(api.users.listAll, {}, { initialNumItems: 50 });

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserType>('all');

  const currentUser = useQuery(api.users.currentUser);
  const isAdmin = currentUser?.role === 'admin';

  const exportData = useQuery(api.exports.exportUsers, {});

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
      <div className="flex items-center w-full h-auto gap-3">
        <div className="flex items-center gap-3">
          <BackButton />
          <Label className="text-lg">User Management</Label>
        </div>
        <div className="flex items-center gap-3 ml-auto">
          <PageHeaderDrawer
            title="User Management Actions"
            description="Search users, filter by role, or export data"
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
                <SelectValue />
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
          </PageHeaderDrawer>
        </div>
      </div>

      <Activity mode={isLoading ? 'visible' : 'hidden'}>
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
      </Activity>

      <Activity mode={isLoading ? 'hidden' : 'visible'}>
        {filtered && filtered.length === 0 && (
          <div className="flex flex-col w-full h-full items-center justify-center">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <UsersIcon />
                </EmptyMedia>
                <EmptyTitle>{search || roleFilter !== 'all' ? 'No results found' : 'No Users Found'}</EmptyTitle>
                <EmptyDescription>
                  {search || roleFilter !== 'all' ? 'Try adjusting your search or filter.' : 'No registered users yet.'}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        )}

        {filtered && filtered.length > 0 && (
          <div className="flex flex-col w-full h-full overflow-y-auto gap-3">
            {filtered.map((user) => (
              <UserRow key={user._id} user={user} isAdmin={isAdmin} />
            ))}

            <Activity mode={status === 'CanLoadMore' ? 'visible' : 'hidden'}>
              <Button variant="outline" onClick={() => loadMore(50)}>
                Load More
              </Button>
            </Activity>
          </div>
        )}
      </Activity>
    </div>
  );
}
