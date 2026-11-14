import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { Users, Mail, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataState, RowsSkeleton } from '@/components/data-state';
import { DataTable } from '@/components/data-table';
import { ChoiceSelect } from '@/components/filters';
import { TextField } from '@/components/form-fields';
import { ListRow } from '@/components/list-row';
import { PageHeader } from '@/components/page-header';
import { ResponsiveOverlay } from '@/components/responsive-overlay';
import { RowActions, type RowAction } from '@/components/row-actions';
import { Toolbar } from '@/components/toolbar';
import { PersonAvatar } from '@/components/visuals';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { canManageTeam, canSeeTeam, roleLabel } from '@/lib/access';
import { useAuth } from '@/lib/auth/use-auth';
import type { BusinessRole } from '@/lib/api/types';
import {
  useTeam,
  useInviteMember,
  useChangeTeamRole,
  useRemoveTeamMember,
  useResendInvite,
  useRevokeInvite,
  type TeamMember,
  type TeamInvite,
} from '@/lib/api/team';
import { formatDateTime } from '@/lib/format';
import { showApiError } from '@/lib/form-errors';

export const Route = createFileRoute('/team')({ component: TeamRoute });

function TeamRoute() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <RowsSkeleton />;
  if (!canSeeTeam(user))
    return (
      <div className="space-y-3">
        <PageHeader
          title="Team"
          description="Owners and Managers of the active business can manage its team."
        />
        <p className="text-muted-foreground">
          Ask an Owner if you need help with access.
        </p>
      </div>
    );
  return (
    <TeamPage
      key={user!.active_business_id}
      businessId={user!.active_business_id}
    />
  );
}

const roles = ['owner', 'manager', 'member'].map((value) => ({
  value,
  label: roleLabel(value),
}));

type Confirmation =
  | { kind: 'role'; member: TeamMember; role: BusinessRole }
  | { kind: 'remove'; member: TeamMember }
  | { kind: 'revoke'; invite: TeamInvite };

function TeamPage({ businessId }: { businessId: string }) {
  const { user } = useAuth();
  const owner = canManageTeam(user);
  const roleOptions = owner
    ? roles
    : roles.filter(({ value }) => value !== 'owner');
  const query = useTeam(businessId);
  const change = useChangeTeamRole();
  const remove = useRemoveTeamMember();
  const resend = useResendInvite();
  const revoke = useRevokeInvite();
  const [search, setSearch] = useState('');
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const pending =
    change.isPending ||
    remove.isPending ||
    revoke.isPending ||
    resend.isPending;
  const matches = (value: string) =>
    value.toLowerCase().includes(search.trim().toLowerCase());
  const members = (query.data?.members ?? []).filter((member) =>
    matches(`${member.name} ${member.email}`)
  );
  const invites = (query.data?.invites ?? []).filter((invite) =>
    matches(invite.email)
  );
  const owners =
    query.data?.members.filter((member) => member.role === 'owner').length ?? 0;

  function memberActions(member: TeamMember): RowAction[] {
    if (!owner && (member.role !== 'member' || member.id === user?.id))
      return [];
    return [
      {
        label: 'Change role',
        disabled: pending || (member.role === 'owner' && owners === 1),
        onSelect: () => setEditing(member),
      },
      {
        label: 'Remove from team',
        destructive: true,
        disabled:
          pending ||
          member.id === user?.id ||
          (member.role === 'owner' && owners === 1),
        onSelect: () => setConfirmation({ kind: 'remove', member }),
      },
    ];
  }

  function inviteActions(invite: TeamInvite): RowAction[] {
    if (!owner && invite.role === 'owner') return [];
    return [
      {
        label: 'Resend invitation',
        disabled: pending,
        onSelect: () =>
          resend.mutate(invite.id, {
            onSuccess: () =>
              toast.success(
                'Invitation sent. The previous link no longer works.'
              ),
            onError: (error) => toast.error(error.message),
          }),
      },
      {
        label: 'Revoke invitation',
        destructive: true,
        disabled: pending,
        onSelect: () => setConfirmation({ kind: 'revoke', invite }),
      },
    ];
  }

  const memberColumns: ColumnDef<TeamMember>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      meta: { main: true },
      cell: ({ row }) => (
        <span className="font-medium">
          {row.original.name}
          {row.original.id === user?.id ? ' (you)' : ''}
        </span>
      ),
    },
    { accessorKey: 'email', header: 'Email' },
    {
      accessorKey: 'role',
      header: 'Role',
      cell: ({ row }) => roleLabel(row.original.role),
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <RowActions
          name={row.original.name}
          actions={memberActions(row.original)}
        />
      ),
    },
  ];
  const inviteColumns: ColumnDef<TeamInvite>[] = [
    { accessorKey: 'email', header: 'Email', meta: { main: true } },
    {
      accessorKey: 'role',
      header: 'Role',
      cell: ({ row }) => roleLabel(row.original.role),
    },
    {
      accessorKey: 'expires_at',
      header: 'Link expires',
      cell: ({ row }) => formatDateTime(row.original.expires_at),
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <RowActions
          name={row.original.email}
          actions={inviteActions(row.original)}
        />
      ),
    },
  ];

  function confirm() {
    if (!confirmation || pending) return;
    const options = {
      onSuccess: () => toast.success('Team updated.'),
      onError: (error: Error) => toast.error(error.message),
    };
    if (confirmation.kind === 'role')
      change.mutate(
        { id: confirmation.member.id, role: confirmation.role },
        options
      );
    else if (confirmation.kind === 'remove')
      remove.mutate(confirmation.member.id, options);
    else revoke.mutate(confirmation.invite.id, options);
    setConfirmation(null);
  }

  return (
    <>
      <PageHeader
        title="Team"
        description="Invite people and manage access to your business."
        actions={
          <Button onClick={() => setInviting(true)}>
            <UserPlus />
            Invite someone
          </Button>
        }
      />
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Owners manage the business and team. Managers handle trades and help
          manage the team. Members work with stock and chat. Keep at least one
          Owner.
        </p>
        <Toolbar
          label="Search team by name or email"
          value={search}
          onChange={setSearch}
        />
        <Tabs defaultValue="members">
          <TabsList>
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="invites">Invitations</TabsTrigger>
          </TabsList>
          <TabsContent value="members" className="pt-4">
            <DataState
              query={query}
              isEmpty={members.length === 0}
              icon={Users}
              emptyTitle="No matching members"
              emptyText="Try another name or email."
            >
              <DataTable
                columns={memberColumns}
                data={members}
                renderCard={(member) => (
                  <ListRow
                    media={<PersonAvatar name={member.name} />}
                    title={
                      member.name + (member.id === user?.id ? ' (you)' : '')
                    }
                    subtitle={member.email}
                    status={
                      <Badge variant="secondary">
                        {roleLabel(member.role)}
                      </Badge>
                    }
                    trailing={
                      <RowActions
                        name={member.name}
                        actions={memberActions(member)}
                      />
                    }
                  />
                )}
              />
            </DataState>
          </TabsContent>
          <TabsContent value="invites" className="pt-4">
            <DataState
              query={query}
              isEmpty={invites.length === 0}
              icon={Mail}
              emptyTitle={
                search ? 'No matching invitations' : 'No pending invitations'
              }
              emptyText={
                search
                  ? 'Try another email.'
                  : 'Invite someone to join your team. Each link lasts 7 days.'
              }
            >
              <DataTable
                columns={inviteColumns}
                data={invites}
                renderCard={(invite) => (
                  <ListRow
                    title={invite.email}
                    subtitle={`${roleLabel(invite.role)} · Link expires ${formatDateTime(invite.expires_at)}`}
                    trailing={
                      <RowActions
                        name={invite.email}
                        actions={inviteActions(invite)}
                      />
                    }
                  />
                )}
              />
            </DataState>
          </TabsContent>
        </Tabs>
      </div>
      <ResponsiveOverlay
        open={inviting}
        onOpenChange={setInviting}
        title="Invite someone"
        description="They can join with a new or existing account using this email address."
      >
        {inviting && (
          <InviteForm owner={owner} onDone={() => setInviting(false)} />
        )}
      </ResponsiveOverlay>
      <ResponsiveOverlay
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
        title={`Change role for ${editing?.name ?? 'member'}`}
        description="Their access will change straight away."
      >
        {editing && (
          <ChoiceSelect
            label={`Role for ${editing.name}`}
            className="w-full"
            value={editing.role}
            options={roleOptions}
            onChange={(role) => {
              if (role === editing.role) return;
              setConfirmation({
                kind: 'role',
                member: editing,
                role: role as BusinessRole,
              });
              setEditing(null);
            }}
          />
        )}
      </ResponsiveOverlay>
      <ConfirmDialog
        open={!!confirmation}
        onOpenChange={(open) => !open && setConfirmation(null)}
        title={
          confirmation?.kind === 'role'
            ? `Change the role of ${confirmation.member.name} to ${roleLabel(confirmation.role)}?`
            : confirmation?.kind === 'remove'
              ? `Remove ${confirmation.member.name} from the team?`
              : 'Revoke this invitation?'
        }
        description={
          confirmation?.kind === 'role'
            ? 'Their access changes immediately. Owners can manage the team and business details.'
            : confirmation?.kind === 'remove'
              ? 'They will lose access to this business immediately. Their account and trade records stay.'
              : 'This invitation link will stop working.'
        }
        confirmLabel={
          confirmation?.kind === 'role'
            ? 'Change role'
            : confirmation?.kind === 'remove'
              ? 'Remove from team'
              : 'Revoke invitation'
        }
        destructive={confirmation?.kind !== 'role'}
        onConfirm={confirm}
      />
    </>
  );
}

const inviteSchema = z.object({
  email: z.string().email('Enter a valid email address.'),
});

function InviteForm({ owner, onDone }: { owner: boolean; onDone: () => void }) {
  const invite = useInviteMember();
  const [role, setRole] = useState<BusinessRole>('member');
  const [failure, setFailure] = useState<string | null>(null);
  const { control, handleSubmit, setError } = useForm<
    z.infer<typeof inviteSchema>
  >({ resolver: zodResolver(inviteSchema), defaultValues: { email: '' } });
  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={handleSubmit(({ email }) => {
        setFailure(null);
        invite.mutate(
          { email, role },
          {
            onSuccess: () => {
              toast.success('Invitation sent.');
              onDone();
            },
            onError: (error) => setFailure(showApiError(error, setError)),
          }
        );
      })}
    >
      <TextField
        control={control}
        name="email"
        label="Email address"
        type="email"
        autoComplete="email"
      />
      <div className="space-y-1.5">
        <span aria-hidden="true" className="block text-sm font-medium">
          Role
        </span>
        <ChoiceSelect
          label="Team role"
          className="w-full"
          value={role}
          options={
            owner ? roles : roles.filter(({ value }) => value !== 'owner')
          }
          onChange={(value) => setRole(value as BusinessRole)}
          disabled={invite.isPending}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        {owner
          ? 'Owners can manage people and business details. Only invite an Owner you trust.'
          : 'Managers can handle trades and help manage the team. Members work with stock and chat.'}
      </p>
      {failure && (
        <p role="alert" className="text-sm text-destructive">
          {failure}
        </p>
      )}
      <Button type="submit" disabled={invite.isPending}>
        {invite.isPending ? 'Sending…' : 'Send invitation'}
      </Button>
    </form>
  );
}
