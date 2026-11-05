import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
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
import { useMock, useMockList, usePerson } from '@/lib/mock/hooks';

/** Where this account is signed in. Revoke one, or sign everything out. */
export function SessionsPanel() {
  const { setRole } = useMock();
  const person = usePerson();
  const list = useMockList('sessions');
  const [signOutOpen, setSignOutOpen] = useState(false);

  return (
    <div className="space-y-4">
      <ItemGroup>
        {list.items.map((session) => (
          <Item key={session.id} variant="outline">
            <ItemContent>
              <ItemTitle>{session.device}</ItemTitle>
              <ItemDescription>
                {session.city} · {session.email}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              {session.email === person.email ? (
                <Badge>Current session</Badge>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    list.remove(session.id);
                    toast.success('Session revoked.');
                  }}
                >
                  Revoke
                </Button>
              )}
            </ItemActions>
          </Item>
        ))}
      </ItemGroup>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => toast('Adding another account is coming soon.')}
        >
          Add account
        </Button>
        <Button variant="destructive" onClick={() => setSignOutOpen(true)}>
          Sign all out
        </Button>
      </div>
      <ConfirmDialog
        open={signOutOpen}
        onOpenChange={setSignOutOpen}
        title="Sign out everywhere?"
        description="Every device, including this one, will need to sign in again."
        confirmLabel="Sign all out"
        cancelLabel="Stay signed in"
        onConfirm={() => {
          setRole('signed-out');
          toast.success('Signed out everywhere.');
        }}
      />
    </div>
  );
}
