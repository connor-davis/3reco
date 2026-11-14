import { useNavigate, useRouterState } from '@tanstack/react-router';
import { Check, ChevronsUpDown } from 'lucide-react';
import { toast } from 'sonner';
import { PersonAvatar } from '@/components/visuals';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { canManageTeam, canOpen, roleLabel } from '@/lib/access';
import { useMyBusinesses, useSelectBusiness } from '@/lib/api/businesses';
import { useAuth } from '@/lib/auth/use-auth';
import { guardedPageFor } from '@/lib/nav';
import { ApiError } from '@/lib/api/client';

/** Business memberships are separate from the accounts signed in to this browser. */
export function WorkspacePicker() {
  const { user } = useAuth();
  const businesses = useMyBusinesses();
  const selectBusiness = useSelectBusiness();
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  if (user?.role !== 'business' || !user.active_business_id) return null;

  const active = businesses.data?.find(
    (business) => business.id === user.active_business_id
  );
  const name = active?.name ?? user.businessName ?? 'Your business';

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) void businesses.refetch();
      }}
    >
      <DropdownMenuTrigger
        disabled={selectBusiness.isPending}
        render={
          <Button
            variant="ghost"
            className="h-11 w-full min-w-0 justify-start gap-2 px-1 lg:px-2"
            aria-label={`Workspace: ${name}, ${roleLabel(user.business_role)}`}
          />
        }
      >
        <PersonAvatar
          name={name}
          image={
            active?.has_logo
              ? `/api/stores/${encodeURIComponent(active.id)}/logo`
              : undefined
          }
          className="size-7 shrink-0"
        />
        <span className="min-w-0 text-left text-xs">
          <span className="block truncate font-medium">{name}</span>
          <span className="hidden text-muted-foreground lg:block">
            {roleLabel(user.business_role)}
          </span>
        </span>
        <ChevronsUpDown
          className="hidden shrink-0 lg:block"
          aria-hidden="true"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {businesses.isPending && (
          <DropdownMenuItem disabled>Loading businesses…</DropdownMenuItem>
        )}
        {businesses.isError && (
          <DropdownMenuItem onClick={() => void businesses.refetch()}>
            Could not load businesses. Try again.
          </DropdownMenuItem>
        )}
        {businesses.data?.length === 0 && (
          <DropdownMenuItem disabled>No businesses found.</DropdownMenuItem>
        )}
        {businesses.data?.map((business) => (
          <DropdownMenuItem
            key={business.id}
            disabled={selectBusiness.isPending}
            onClick={() => {
              if (business.id === user.active_business_id) return;
              selectBusiness.mutate(business.id, {
                onSuccess: ({ user: next }) => {
                  const page = guardedPageFor(pathname);
                  if (
                    (page && !canOpen(next.role, page)) ||
                    (pathname === '/team' && !canManageTeam(next))
                  ) {
                    void navigate({ to: '/' });
                  }
                  toast.success(`Now acting for ${business.name}.`);
                },
                onError: (error) =>
                  toast.error(
                    error instanceof ApiError
                      ? error.message
                      : 'Could not change workspace. Try again.'
                  ),
              });
            }}
          >
            <PersonAvatar
              name={business.name}
              image={
                business.has_logo
                  ? `/api/stores/${encodeURIComponent(business.id)}/logo`
                  : undefined
              }
              className="size-7 shrink-0"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{business.name}</span>
              <span className="block text-xs text-muted-foreground">
                {roleLabel(business.role)}
              </span>
            </span>
            {business.id === user.active_business_id && (
              <Check aria-label="Active workspace" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
