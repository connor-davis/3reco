import { useNavigate } from '@tanstack/react-router';
import { ChevronsUpDown, LogOut, Plus, UserCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '@/components/providers/theme';
import { PersonAvatar } from '@/components/visuals';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { roleLabels } from '@/lib/access';
import { roleForEmail } from '@/lib/data/people';
import { useMock, useMockList, usePerson } from '@/lib/mock/hooks';

/** The account button in the top bar: profile, other sessions, theme, sign out. */
export function AccountMenu() {
  const navigate = useNavigate();
  const { role, setRole } = useMock();
  const { theme, setTheme } = useTheme();
  const sessions = useMockList('sessions');
  const person = usePerson();

  if (role === 'signed-out') return null;

  function signOut() {
    setRole('signed-out');
    toast.success('You have been signed out.');
    navigate({ to: '/auth/sign-in' });
  }

  function signAllOut() {
    sessions.replace([]);
    signOut();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className="h-auto gap-2 px-2 py-1"
            aria-label="Account menu"
          />
        }
      >
        <PersonAvatar name={person.name} />
        <span className="hidden min-w-0 text-left text-xs sm:block">
          <span className="block truncate font-medium">{person.name}</span>
          <span className="block truncate text-muted-foreground">
            {roleLabels[role]}
          </span>
        </span>
        <ChevronsUpDown className="hidden sm:block" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <span className="block font-medium text-foreground">
              {person.name}
            </span>
            <span className="block text-xs">{person.email}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate({ to: '/profile' })}>
          <UserCircle />
          Profile
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            Accounts in this browser
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-64">
            {sessions.items.map((session) => (
              <DropdownMenuItem
                key={session.id}
                onClick={() => {
                  const next = roleForEmail(session.email);

                  if (!next || session.email === person.email) return;

                  setRole(next);
                  toast.success(`Switched to ${session.email}.`);
                }}
              >
                <span className="min-w-0">
                  <span className="block truncate">{session.email}</span>
                  <span className="block text-xs text-muted-foreground">
                    {session.email === person.email
                      ? 'Current session'
                      : session.device}
                  </span>
                </span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate({ to: '/auth/sign-in' })}>
              <Plus />
              Add account
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={signAllOut}>
              Sign all out
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={theme}
            onValueChange={(next) =>
              setTheme(next as 'light' | 'dark' | 'system')
            }
          >
            <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
