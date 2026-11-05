import { useState } from 'react';
import { toast } from 'sonner';
import { LogIn } from 'lucide-react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataState } from '@/components/data-state';
import { LinkButton } from '@/components/link-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@/components/ui/item';
import {
  useSessions,
  useRevokeSession,
  useSignOutAll,
  useRevokeOtherSessions,
} from '@/lib/api/auth';
import { formatDate } from '@/lib/format';

export function SessionsPanel() {
  const sessions = useSessions();
  const revoke = useRevokeSession();
  const signOut = useSignOutAll();
  const revokeOthers = useRevokeOtherSessions();
  const [open, setOpen] = useState(false);
  const pending =
    revoke.isPending || signOut.isPending || revokeOthers.isPending;
  const error = revoke.error ?? signOut.error ?? revokeOthers.error;

  return (
    <div className="space-y-4">
      <DataState
        query={sessions}
        isEmpty={sessions.data?.sessions.length === 0}
        icon={LogIn}
        emptyTitle="No sessions"
        emptyText="Sign in again to manage sessions."
      >
        <ItemGroup>
          {sessions.data?.sessions.map((session) => (
            <Item key={session.id} variant="outline">
              <ItemContent>
                <ItemTitle>{session.name}</ItemTitle>
                <ItemDescription>
                  {session.email} · {session.role ?? 'No role'} · Started{' '}
                  {formatDate(session.createdAt)}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                {session.current ? (
                  <Badge>Current session</Badge>
                ) : (
                  <Button
                    className="min-h-11"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      revoke.mutate(session.id, {
                        onSuccess: () => toast.success('Session revoked.'),
                      })
                    }
                  >
                    Revoke
                  </Button>
                )}
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      </DataState>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error.message} Try again.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <LinkButton className="min-h-11" to="/sign-in" variant="outline">
          Add account
        </LinkButton>
        <Button
          className="min-h-11"
          variant="outline"
          disabled={pending}
          onClick={() =>
            revokeOthers.mutate(undefined, {
              onSuccess: () => toast.success('Other sessions revoked.'),
            })
          }
        >
          Revoke other sessions
        </Button>
        <Button
          className="min-h-11"
          variant="destructive"
          disabled={pending}
          onClick={() => setOpen(true)}
        >
          Sign all out
        </Button>
      </div>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Sign all accounts out?"
        description="All accounts saved in this browser will need to sign in again."
        confirmLabel="Sign all out"
        cancelLabel="Stay signed in"
        onConfirm={() => signOut.mutate()}
      />
    </div>
  );
}
